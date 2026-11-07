import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const TEST_DB_PATH = path.resolve(__dirname, "temp_allocation_test.db");

// Force isolated test database
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;

async function runScenario(name: string, fn: () => Promise<void>) {
  console.log(`\n  [SCENARIO] START: ${name}`);
  try {
    await fn();
    console.log(`  [SCENARIO] PASS: ${name}`);
  } catch (err) {
    console.error(`  [SCENARIO] FAIL: ${name}`, err);
    throw err;
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("  GRARI MEUBLES ERP — SUITE DE TESTS : IMPUTATION SUR DETTE FOURNISSEUR");
  console.log(`  Base de test isolée : ${TEST_DB_PATH}`);
  console.log("=".repeat(80));

  // 1. Cleanup old test db
  for (const f of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  }

  // 2. Apply all migrations to isolated database
  console.log("\nApplying migrations to isolated test database...");
  const { createClient } = await import("@libsql/client");
  const sqliteClient = createClient({ url: `file:${TEST_DB_PATH}` });

  const migrationsDir = path.resolve(projectRoot, "prisma", "migrations");
  const migrationDirs = fs
    .readdirSync(migrationsDir)
    .filter((d) => fs.statSync(path.join(migrationsDir, d)).isDirectory())
    .sort();

  for (const dir of migrationDirs) {
    const migrationFile = path.join(migrationsDir, dir, "migration.sql");
    if (fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, "utf-8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await sqliteClient.execute(stmt);
      }
    }
  }

  // Ensure monthly_closing_periods table exists
  await sqliteClient.execute(`
    CREATE TABLE IF NOT EXISTS "monthly_closing_periods" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "month" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "isLocked" BOOLEAN NOT NULL DEFAULT 0,
        "periodStart" DATETIME NOT NULL,
        "periodEnd" DATETIME NOT NULL,
        "finalSnapshotId" INTEGER,
        "finalSnapshotRef" TEXT,
        "approvedBy" TEXT,
        "approvedAt" DATETIME,
        "approvalNotes" TEXT,
        "backupConfirmedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await sqliteClient.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closing_periods_month_key" ON "monthly_closing_periods"("month");`);
  await sqliteClient.execute(`CREATE INDEX IF NOT EXISTS "monthly_closing_periods_status_idx" ON "monthly_closing_periods"("status");`);

  sqliteClient.close();
  console.log("Migrations applied successfully.");

  // Import after setting process.env.DATABASE_URL
  const { prisma } = await import("../src/lib/prisma.ts");
  const {
    calculateSupplierDebt,
    recordSupplierInitialDebtAction,
    getSupplierStatement,
  } = await import("../src/app/suppliers/actions.ts");
  const {
    createSupplierAdditionalPaymentAction,
    reverseSupplierAdditionalPaymentAction,
    getSupplierAdditionalPaymentTotal,
  } = await import("../src/app/suppliers/additional-payment-actions.ts");
  const {
    createSupplierAdditionalPaymentAllocationAction,
    reverseSupplierAdditionalPaymentAllocationAction,
    getSupplierAllocationsSummary,
    getSupplierEligibleAdditionalPayments,
    getSupplierAllocationHistory,
  } = await import("../src/app/suppliers/allocation-actions.ts");
  const { calculateAccountBalance } = await import("../src/app/cash/treasury-actions.ts");

  // ─── SETUP INITIAL DATA ───────────────────────────────────────────────────
  console.log("\nSetting up initial master data...");

  // Treasury Accounts: Safe (Coffre magasin) with 10M DA, Caisse with 500k DA
  const safeAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-COFFRE-MAGASIN" },
    update: { openingBalance: 10000000, isActive: true },
    create: {
      code: "ACC-COFFRE-MAGASIN",
      name: "Coffre magasin",
      type: "safe",
      isDefault: false,
      isActive: true,
      openingBalance: 10000000,
    },
  });

  const caisseAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-CAISSE" },
    update: { openingBalance: 500000, isActive: true },
    create: {
      code: "ACC-CAISSE",
      name: "Caisse journalière",
      type: "cash",
      isDefault: true,
      isActive: true,
      openingBalance: 500000,
    },
  });

  // Supplier A with initial debt of 2,500,000 DA
  const supplierA = await prisma.supplier.create({
    data: {
      code: "SUP-A",
      name: "Fournisseur Bois Confort",
      phone: "0550111222",
    },
  });

  await recordSupplierInitialDebtAction({
    supplierId: supplierA.id,
    amount: 2500000,
    description: "Dette antérieure report",
  });

  // Supplier B with debt of 1,000,000 DA
  const supplierB = await prisma.supplier.create({
    data: {
      code: "SUP-B",
      name: "Fournisseur Tissus Atlas",
      phone: "0550333444",
    },
  });

  await recordSupplierInitialDebtAction({
    supplierId: supplierB.id,
    amount: 1000000,
    description: "Dette initiale Tissus",
  });

  // Supplier A gets 1,000,000 DA additional payment from Safe
  const p1Res = await createSupplierAdditionalPaymentAction({
    supplierId: supplierA.id,
    amount: 1000000,
    treasuryAccountId: safeAccount.id,
    description: "Avance exceptionnelle hors dette",
    paymentMethod: "safe_transfer",
  });
  assert.ok(p1Res.success, "Payment 1 must succeed");
  const payment1 = p1Res.data as any;

  // Safe balance drops from 10,000,000 to 9,000,000 DA
  let safeBal = await calculateAccountBalance(safeAccount.id);
  assert.equal(safeBal, 9000000, "Safe balance must decrease by 1M DA to 9M DA");

  // Supplier debt remains exactly 2,500,000 DA
  let debtA = await calculateSupplierDebt(supplierA.id);
  assert.equal(debtA.outstandingDebt, 2500000, "Supplier A debt must remain 2.5M DA");

  // ─── SCENARIO 1 & 2: PARTIAL ALLOCATION (600,000 DA) ──────────────────────
  await runScenario(
    "Partial allocation: 600,000 DA allocated to debt, supplier debt decreases, remaining = 400,000 DA, treasury strictly unchanged",
    async () => {
      const allocRes = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment1.id,
        amount: 600000,
        description: "Imputation partielle sur dette report",
      });

      assert.ok(allocRes.success, "Allocation must succeed");
      const alloc = allocRes.data as any;
      assert.equal(alloc.amount, 600000);
      assert.equal(alloc.status, "completed");
      assert.equal(alloc.isReversal, false);

      // Check supplier debt: 2,500,000 - 600,000 = 1,900,000 DA
      const newDebt = await calculateSupplierDebt(supplierA.id);
      assert.equal(newDebt.outstandingDebt, 1900000, "Outstanding debt must be 1,900,000 DA");
      assert.equal(newDebt.totalAllocated, 600000, "Total allocated must be 600,000 DA");

      // Check summary: totalGiven = 1M, totalAllocated = 600k, unallocated = 400k
      const summary = await getSupplierAllocationsSummary(supplierA.id);
      assert.equal(summary.totalGiven, 1000000);
      assert.equal(summary.totalAllocated, 600000);
      assert.equal(summary.unallocatedAmount, 400000);

      // Check eligible payments: remaining = 400,000 DA
      const eligible = await getSupplierEligibleAdditionalPayments(supplierA.id);
      assert.equal(eligible.length, 1);
      assert.equal(eligible[0].remainingAmount, 400000);

      // Check treasury: SAFE BALANCE STILL EXACTLY 9,000,000 DA (TREASURY IMPACT = 0 DA)
      const currentSafeBal = await calculateAccountBalance(safeAccount.id);
      assert.equal(currentSafeBal, 9000000, "Treasury balance must be strictly untouched (9M DA)");
    }
  );

  // ─── SCENARIO 3: MULTIPLE ALLOCATIONS FROM SAME PAYMENT (250,000 DA then 150,000 DA) ──
  await runScenario(
    "Multiple allocations from same payment until fully depleted",
    async () => {
      // Allocate 250,000 DA
      const res2 = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment1.id,
        amount: 250000,
      });
      assert.ok(res2.success);

      let summary = await getSupplierAllocationsSummary(supplierA.id);
      assert.equal(summary.totalAllocated, 850000);
      assert.equal(summary.unallocatedAmount, 150000);

      let debt = await calculateSupplierDebt(supplierA.id);
      assert.equal(debt.outstandingDebt, 1650000);

      // Allocate remaining 150,000 DA (full depletion)
      const res3 = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment1.id,
        amount: 150000,
      });
      assert.ok(res3.success);

      summary = await getSupplierAllocationsSummary(supplierA.id);
      assert.equal(summary.totalAllocated, 1000000);
      assert.equal(summary.unallocatedAmount, 0);

      debt = await calculateSupplierDebt(supplierA.id);
      assert.equal(debt.outstandingDebt, 1500000);

      // Eligible payments list is now empty for Supplier A
      const eligible = await getSupplierEligibleAdditionalPayments(supplierA.id);
      assert.equal(eligible.length, 0, "Depleted payment must not be in eligible list");

      // Treasury still 9M DA
      assert.equal(await calculateAccountBalance(safeAccount.id), 9000000);
    }
  );

  // ─── SCENARIO 4: ALLOCATION FROM MULTIPLE PAYMENTS ────────────────────────
  let payment2: any;
  await runScenario(
    "Allocation from multiple additional payments to the same supplier",
    async () => {
      // Give Supplier A a second payment of 500,000 DA
      const p2Res = await createSupplierAdditionalPaymentAction({
        supplierId: supplierA.id,
        amount: 500000,
        treasuryAccountId: safeAccount.id,
        paymentMethod: "safe_transfer",
      });
      assert.ok(p2Res.success);
      payment2 = p2Res.data;

      // Safe drops to 8,500,000 DA
      assert.equal(await calculateAccountBalance(safeAccount.id), 8500000);

      // Supplier debt is still 1,500,000 DA
      let debt = await calculateSupplierDebt(supplierA.id);
      assert.equal(debt.outstandingDebt, 1500000);

      // Allocate 300,000 DA from payment 2
      const allocRes = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment2.id,
        amount: 300000,
      });
      assert.ok(allocRes.success);

      // Debt becomes 1,200,000 DA
      debt = await calculateSupplierDebt(supplierA.id);
      assert.equal(debt.outstandingDebt, 1200000);

      // Total given: 1.5M, total allocated: 1.3M, unallocated: 200,000 DA
      const summary = await getSupplierAllocationsSummary(supplierA.id);
      assert.equal(summary.totalGiven, 1500000);
      assert.equal(summary.totalAllocated, 1300000);
      assert.equal(summary.unallocatedAmount, 200000);

      // Treasury remains 8.5M DA
      assert.equal(await calculateAccountBalance(safeAccount.id), 8500000);
    }
  );

  // ─── SCENARIO 5: ALLOCATION EXCEEDING REMAINING AMOUNT REJECTED ────────────
  await runScenario(
    "Allocation exceeding payment's remaining unallocated amount is rejected",
    async () => {
      // payment2 has 200,000 DA remaining. Attempt to allocate 300,000 DA.
      const res = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment2.id,
        amount: 300000,
      });

      assert.equal(res.success, false, "Must reject over-allocation");
      assert.ok(res.error?.includes("dépasse le solde disponible"), "Error message must mention exceeding balance");

      // Verify no changes occurred
      const summary = await getSupplierAllocationsSummary(supplierA.id);
      assert.equal(summary.unallocatedAmount, 200000);
    }
  );

  // ─── SCENARIO 6: ALLOCATION EXCEEDING OUTSTANDING DEBT REJECTED ────────────
  await runScenario(
    "Allocation exceeding outstanding debt is rejected (no negative debt allowed)",
    async () => {
      // Supplier B has 1,000,000 DA debt.
      // Give Supplier B 2,000,000 DA additional payment.
      const pB = await createSupplierAdditionalPaymentAction({
        supplierId: supplierB.id,
        amount: 2000000,
        treasuryAccountId: safeAccount.id,
        paymentMethod: "safe_transfer",
      });
      assert.ok(pB.success);

      // Attempt to allocate 1,500,000 DA (debt is only 1,000,000 DA)
      const res = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierB.id,
        paymentId: (pB.data as any).id,
        amount: 1500000,
      });

      assert.equal(res.success, false, "Must reject allocation exceeding debt");
      assert.ok(res.error?.includes("dépasse la dette fournisseur restante"), "Error must mention exceeding debt");

      // Verify debt is still 1,000,000 DA
      const debtB = await calculateSupplierDebt(supplierB.id);
      assert.equal(debtB.outstandingDebt, 1000000);
    }
  );

  // ─── SCENARIO 7: ALLOCATION FOR ANOTHER SUPPLIER'S PAYMENT REJECTED ────────
  await runScenario(
    "Allocation of a payment belonging to a different supplier is rejected",
    async () => {
      // Attempt to use payment2 (Supplier A) for Supplier B
      const res = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierB.id,
        paymentId: payment2.id,
        amount: 100000,
      });

      assert.equal(res.success, false);
      assert.ok(res.error?.includes("n'appartient pas au fournisseur"));
    }
  );

  // ─── SCENARIO 8: REVERSED ORIGINAL ADDITIONAL PAYMENT REJECTED ─────────────
  await runScenario(
    "Allocation from a reversed additional payment is rejected",
    async () => {
      // Give Supplier B a payment of 100,000 DA and immediately reverse it
      const pTmp = await createSupplierAdditionalPaymentAction({
        supplierId: supplierB.id,
        amount: 100000,
        treasuryAccountId: safeAccount.id,
        paymentMethod: "safe_transfer",
      });
      assert.ok(pTmp.success);
      const revRes = await reverseSupplierAdditionalPaymentAction({
        paymentId: (pTmp.data as any).id,
        reason: "Annulation de test immédiate",
      });
      assert.ok(revRes.success);

      // Attempt to allocate from the reversed payment
      const allocRes = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierB.id,
        paymentId: (pTmp.data as any).id,
        amount: 50000,
      });
      assert.equal(allocRes.success, false);
      assert.ok(allocRes.error?.includes("annulé ou contrepassé"));
    }
  );

  // ─── SCENARIO 9: IDEMPOTENCY HANDLING ──────────────────────────────────────
  await runScenario(
    "Idempotency: Replaying identical allocation returns existing; mismatch rejected",
    async () => {
      const ikey = "idemp-alloc-test-key-1";
      const res1 = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment2.id,
        amount: 50000,
        idempotencyKey: ikey,
      });
      assert.ok(res1.success);

      // Replay identical
      const res2 = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment2.id,
        amount: 50000,
        idempotencyKey: ikey,
      });
      assert.ok(res2.success);
      assert.equal((res2.data as any).id, (res1.data as any).id, "Must return existing record");

      // Replay with different amount
      const res3 = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment2.id,
        amount: 99999,
        idempotencyKey: ikey,
      });
      assert.equal(res3.success, false);
      assert.ok(res3.error?.includes("Idempotency conflict"));
    }
  );

  // ─── SCENARIO 10: ALLOCATION REVERSAL ──────────────────────────────────────
  let allocationToReverse: any;
  await runScenario(
    "Allocation reversal restores supplier debt and unallocated balance, 0 treasury impact",
    async () => {
      // Allocate 50,000 DA from payment2
      const allocRes = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment2.id,
        amount: 50000,
        description: "Imputation à annuler",
      });
      assert.ok(allocRes.success);
      allocationToReverse = allocRes.data;

      const debtBefore = (await calculateSupplierDebt(supplierA.id)).outstandingDebt;
      const unallocBefore = (await getSupplierAllocationsSummary(supplierA.id)).unallocatedAmount;
      const safeBalBefore = await calculateAccountBalance(safeAccount.id);

      // Reverse the allocation
      const revRes = await reverseSupplierAdditionalPaymentAllocationAction({
        allocationId: allocationToReverse.id,
        reason: "Erreur de saisie compte fournisseur",
      });
      assert.ok(revRes.success);

      // Debt is restored (+50,000 DA)
      const debtAfter = (await calculateSupplierDebt(supplierA.id)).outstandingDebt;
      assert.equal(debtAfter, debtBefore + 50000, "Debt must increase back by 50,000 DA");

      // Unallocated balance is restored (+50,000 DA)
      const unallocAfter = (await getSupplierAllocationsSummary(supplierA.id)).unallocatedAmount;
      assert.equal(unallocAfter, unallocBefore + 50000, "Unallocated balance must increase by 50,000 DA");

      // Treasury balance is 100% UNCHANGED
      const safeBalAfter = await calculateAccountBalance(safeAccount.id);
      assert.equal(safeBalAfter, safeBalBefore, "Treasury must remain strictly identical");

      // Check original record status
      const originalUpdated = await prisma.supplierAdditionalPaymentAllocation.findUnique({
        where: { id: allocationToReverse.id },
      });
      assert.equal(originalUpdated?.status, "reversed");
      assert.equal(originalUpdated?.reversalReason, "Erreur de saisie compte fournisseur");
    }
  );

  // ─── SCENARIO 11: ATTEMPT TO REVERSE TWICE REJECTED ────────────────────────
  await runScenario(
    "Attempting to reverse the same allocation twice is rejected",
    async () => {
      const res = await reverseSupplierAdditionalPaymentAllocationAction({
        allocationId: allocationToReverse.id,
        reason: "Deuxième tentative illégale",
      });
      assert.equal(res.success, false);
      assert.ok(res.error?.includes("déjà été contrepassée"));
    }
  );

  // ─── SCENARIO 12: PREVENT REVERSING ORIGINAL PAYMENT WITH ACTIVE ALLOCATIONS ─
  await runScenario(
    "Reversing the original additional payment is BLOCKED if active allocations exist",
    async () => {
      // payment2 currently has an active 50,000 DA allocation (from Scenario 9).
      // Attempting to reverse payment2 must be rejected!
      const res = await reverseSupplierAdditionalPaymentAction({
        paymentId: payment2.id,
        reason: "Tentative d'annulation du versement avec imputations",
      });

      assert.equal(res.success, false, "Must reject reversing payment with active allocations");
      assert.ok(
        res.error?.includes("des imputations sur dette y sont actuellement associées"),
        "Error must instruct user to reverse allocations first"
      );
    }
  );

  // ─── SCENARIO 13: ALLOCATION WITH LINKED PURCHASE ──────────────────────────
  await runScenario(
    "Allocation linked to a specific purchase updates purchase paidAmount and paymentStatus",
    async () => {
      // Create a purchase for Supplier A: totalAmount = 300,000 DA
      const purchase = await prisma.purchase.create({
        data: {
          reference: "ACH-TEST-ALLOC-01",
          supplierId: supplierA.id,
          totalAmount: 300000,
          paidAmount: 0,
          paymentStatus: "unpaid",
          status: "received",
        },
      });

      // Allocate 200,000 DA from payment2 specifically on this purchase
      // (Wait, payment2 has 100,000 DA remaining: 500k - 300k - 50k - 50k(reversed) = 100k remaining)
      const eligible = await getSupplierEligibleAdditionalPayments(supplierA.id);
      const p2Eligible = eligible.find((e) => e.id === payment2.id);
      assert.ok(p2Eligible && p2Eligible.remainingAmount >= 100000);

      const allocRes = await createSupplierAdditionalPaymentAllocationAction({
        supplierId: supplierA.id,
        paymentId: payment2.id,
        amount: 100000,
        purchaseId: purchase.id,
        description: `Imputation sur commande ${purchase.reference}`,
      });
      assert.ok(allocRes.success);

      // Check purchase updated
      const updatedPurchase = await prisma.purchase.findUnique({
        where: { id: purchase.id },
      });
      assert.equal(updatedPurchase?.paidAmount, 100000);
      assert.equal(updatedPurchase?.paymentStatus, "partial");

      // Reverse this allocation
      const revRes = await reverseSupplierAdditionalPaymentAllocationAction({
        allocationId: (allocRes.data as any).id,
        reason: "Annulation pour test commande",
      });
      assert.ok(revRes.success);

      // Purchase is reverted to unpaid with paidAmount = 0
      const revertedPurchase = await prisma.purchase.findUnique({
        where: { id: purchase.id },
      });
      assert.equal(revertedPurchase?.paidAmount, 0);
      assert.equal(revertedPurchase?.paymentStatus, "unpaid");
    }
  );

  // ─── SCENARIO 14: SUPPLIER STATEMENT REFLECTS ALLOCATIONS ─────────────────
  await runScenario(
    "Supplier statement accurately reflects ALLOCATION events and summary numbers",
    async () => {
      const statement = await getSupplierStatement(supplierA.id);
      assert.ok(statement, "Statement must exist");

      // Verify events contain ALLOCATION
      const allocEvents = statement.events.filter((e) => e.type === "ALLOCATION");
      assert.ok(allocEvents.length > 0, "Statement must include ALLOCATION events");

      for (const ev of allocEvents) {
        assert.equal(ev.credit, 0, "Allocations must have credit = 0");
        assert.ok(ev.debit > 0, "Allocations must have debit > 0 to decrease running debt");
      }

      // Check summary
      const debtInfo = await calculateSupplierDebt(supplierA.id);
      assert.equal(statement.summary.outstandingDebt, debtInfo.outstandingDebt, "Statement debt must match calculateSupplierDebt");
      assert.equal(statement.summary.totalAllocated, debtInfo.totalAllocated, "Total allocated must match");
    }
  );

  // ─── SCENARIO 15: TOTAL AUDIT CHECK ───────────────────────────────────────
  await runScenario(
    "Final audit: No negative balances, history preserved, zero treasury corruption",
    async () => {
      const allAllocations = await getSupplierAllocationHistory(supplierA.id);
      assert.ok(allAllocations.length >= 4, "All allocations must be preserved in history");

      const debt = await calculateSupplierDebt(supplierA.id);
      assert.ok(debt.outstandingDebt >= 0, "Debt cannot be negative");

      const summary = await getSupplierAllocationsSummary(supplierA.id);
      assert.ok(summary.unallocatedAmount >= 0, "Unallocated amount cannot be negative");
      assert.equal(
        summary.unallocatedAmount,
        summary.totalGiven - summary.totalAllocated,
        "Unallocated formula must strictly hold"
      );
    }
  );

  console.log("\n" + "=".repeat(80));
  console.log("  RÉSUMÉ DES TESTS : TOUS LES 15 SCÉNARIOS SONT VALIDÉS AVEC SUCCÈS (100% OK) !");
  console.log("=".repeat(80));

  // Cleanup test database
  for (const f of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  }
}

main().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
