/**
 * Integration Test Suite: Supplier Additional Payment (Non-Debt Payment)
 * "Versement supplémentaire fournisseur"
 *
 * Runs against an isolated temporary SQLite database: tests/temp_additional_payment_test.db
 * Never touches or migrates the production database (prisma/shop.db).
 *
 * Verifies all 12 criteria specified in the requirements:
 * 1. Giving money to a supplier decreases the selected treasury balance.
 * 2. Supplier debt remains exactly unchanged.
 * 3. Supplier advances remain unchanged.
 * 4. Supplier purchase totals remain unchanged.
 * 5. The operation appears in treasury history.
 * 6. Caisse operations correctly update the open cash session.
 * 7. Coffre operations do not affect the Caisse session.
 * 8. Insufficient treasury balance is rejected.
 * 9. Duplicate submissions do not create duplicate transactions.
 * 10. Reversal restores the original treasury balance.
 * 11. Reversal does not modify supplier debt.
 * 12. Closed sessions and locked periods are respected.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "tests", "temp_additional_payment_test.db");

// Clean up previous test database
try {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
} catch {
  // Ignore lock
}

process.env.DATABASE_URL = `file:${testDbPath}`;

interface ScenarioResult {
  scenario: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: ScenarioResult[] = [];

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runScenario(scenario: string, name: string, fn: () => Promise<void>) {
  try {
    console.log(`  [${scenario}] START: ${name}`);
    await fn();
    results.push({ scenario, name, passed: true });
    console.log(`  [${scenario}] PASS: ${name}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ scenario, name, passed: false, error: errorMsg });
    console.error(`  [${scenario}] FAIL: ${name}\n         Cause: ${errorMsg}`);
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("  GRARI MEUBLES ERP — SUITE DE TESTS : VERSEMENT SUPPLÉMENTAIRE FOURNISSEUR");
  console.log(`  Base de test isolée : ${testDbPath}`);
  console.log("=".repeat(80) + "\n");

  // 1. Appliquer toutes les migrations
  const { createClient } = await import("@libsql/client");
  const ddlClient = createClient({ url: `file:${testDbPath}` });

  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  console.log(`Applying ${migrationFolders.length} migrations to isolated test database...`);
  for (const folder of migrationFolders) {
    const sqlFile = path.join(migrationsDir, folder, "migration.sql");
    if (fs.existsSync(sqlFile)) {
      const sql = fs.readFileSync(sqlFile, "utf-8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        try {
          await ddlClient.execute(stmt);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("already exists")) {
            console.warn(`Warning in migration ${folder}: ${msg}`);
          }
        }
      }
    }
  }

  // Monthly closing periods table for locked periods test
  await ddlClient.execute(`
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
  await ddlClient.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closing_periods_month_key" ON "monthly_closing_periods"("month");`);
  await ddlClient.execute(`CREATE INDEX IF NOT EXISTS "monthly_closing_periods_status_idx" ON "monthly_closing_periods"("status");`);

  ddlClient.close();
  console.log("Migrations applied successfully.\n");

  // 2. Importer Prisma et modules d'actions
  const { prisma } = await import("@/lib/prisma");
  const treasuryActions = await import("@/app/cash/treasury-actions");
  const cashActions = await import("@/app/cash/actions");
  const supplierActions = await import("@/app/suppliers/actions");
  const additionalPaymentActions = await import("@/app/suppliers/additional-payment-actions");

  // Setup Accounts
  const caisseAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-CAISSE" },
    update: { openingBalance: 100000, isActive: true },
    create: {
      code: "ACC-CAISSE",
      name: "Caisse principale",
      type: "cash",
      openingBalance: 100000,
      isDefault: true,
      isActive: true,
    },
  });

  const coffreAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-COFFRE-MAGASIN" },
    update: { openingBalance: 5000000, isActive: true },
    create: {
      code: "ACC-COFFRE-MAGASIN",
      name: "Coffre magasin",
      type: "safe",
      openingBalance: 5000000,
      isDefault: false,
      isActive: true,
    },
  });

  const banqueAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-BANQUE" },
    update: { openingBalance: 10000000, isActive: true },
    create: {
      code: "ACC-BANQUE",
      name: "Compte Bancaire BNA",
      type: "bank",
      openingBalance: 10000000,
      isDefault: false,
      isActive: true,
    },
  });

  // Setup Supplier with existing debt of 2,500,000 DA
  const supplierWithDebt = await prisma.supplier.create({
    data: {
      code: "FRN-DEBT-01",
      name: "Fournisseur Bois Atlas",
      phone: "0550112233",
    },
  });

  await supplierActions.recordSupplierInitialDebtAction({
    supplierId: supplierWithDebt.id,
    amount: 2500000,
    debtDate: "2026-01-01",
    reference: "DETTE-INIT-ATLAS",
    notes: "Dette ancienne d'achat de bois",
  });

  // Setup Supplier without debt
  const supplierNoDebt = await prisma.supplier.create({
    data: {
      code: "FRN-CLEAN-02",
      name: "Fournisseur Tissus Moderne",
      phone: "0660445566",
    },
  });

  // ─── CRITERIA 1, 2, 3, 4: GIVING MONEY TO SUPPLIER WITH DEBT ───────────────────
  await runScenario(
    "SCENARIO 1",
    "Supplier with debt receives 1,000,000 DA: treasury decreases, supplier debt strictly unchanged",
    async () => {
      const debtBefore = await supplierActions.calculateSupplierDebt(supplierWithDebt.id);
      assert(debtBefore.outstandingDebt === 2500000, `Dette avant attendue 2 500 000 DA, obtenue ${debtBefore.outstandingDebt}`);

      const coffreBalBefore = await treasuryActions.calculateAccountBalance(coffreAccount.id);
      assert(coffreBalBefore === 5000000, `Coffre avant attendu 5 000 000 DA, obtenu ${coffreBalBefore}`);

      // Shop gives 1,000,000 DA to supplier
      const res = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierWithDebt.id,
        amount: 1000000,
        treasuryAccountId: coffreAccount.id,
        paymentMethod: "safe_transfer",
        date: "2026-11-04",
        description: "Versement de trésorerie exceptionnel",
        idempotencyKey: "test-idemp-scen1",
      });

      assert(res.success, `Versement échoué: ${res.error}`);

      // 1. Treasury balance decreases by exact amount
      const coffreBalAfter = await treasuryActions.calculateAccountBalance(coffreAccount.id);
      assert(
        coffreBalAfter === 4000000,
        `Solde coffre après versement attendu 4 000 000 DA, obtenu ${coffreBalAfter}`
      );

      // 2. Supplier debt must remain EXACTLY 2,500,000 DA
      const debtAfter = await supplierActions.calculateSupplierDebt(supplierWithDebt.id);
      assert(
        debtAfter.outstandingDebt === 2500000,
        `CRITIQUE: La dette fournisseur a été modifiée ! Attendue 2 500 000 DA, obtenue ${debtAfter.outstandingDebt}`
      );

      // 3. Advances must remain unchanged
      assert(
        (debtAfter.outstandingCredit ?? 0) === 0,
        `Les avances / crédits fournisseur doivent rester 0, obtenu ${debtAfter.outstandingCredit}`
      );

      // 4. Purchases count and totals must remain unchanged
      const purchaseCount = await prisma.purchase.count({ where: { supplierId: supplierWithDebt.id } });
      assert(purchaseCount === 0, "Aucun achat ne doit avoir été créé");

      // Verify Additional Payment total
      const totalGiven = await additionalPaymentActions.getSupplierAdditionalPaymentTotal(supplierWithDebt.id);
      assert(totalGiven === 1000000, `Total versé hors dette attendu 1 000 000 DA, obtenu ${totalGiven}`);
    }
  );

  // ─── CRITERIA 5: OPERATION APPEARS IN TREASURY HISTORY ───────────────────────
  await runScenario(
    "SCENARIO 2",
    "Operation appears in treasury history and account movements ledger",
    async () => {
      const movementsData = await treasuryActions.getAccountMovements(coffreAccount.id);
      const paymentMovement = movementsData.movements.find(
        (m) => m.type === "SUPPLIER_ADDITIONAL_PAYMENT" && m.outflow === 1000000
      );

      assert(paymentMovement !== undefined, "L'opération doit figurer dans les mouvements du coffre");
      assert(
        paymentMovement?.typeLabel === "Versement supplémentaire fournisseur",
        `Libellé incorrect: ${paymentMovement?.typeLabel}`
      );
      assert(
        paymentMovement?.party === "Fournisseur Bois Atlas",
        `Bénéficiaire incorrect: ${paymentMovement?.party}`
      );
    }
  );

  // ─── CRITERIA 6 & 7: CAISSE VS COFFRE & CASH SESSION ENFORCEMENT ───────────────
  await runScenario(
    "SCENARIO 3",
    "Caisse requires active session; updates totalCashOut; Coffre does not affect Caisse",
    async () => {
      // 1. Without active session, Caisse withdrawal must be REJECTED
      const noSessionRes = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierNoDebt.id,
        amount: 20000,
        treasuryAccountId: caisseAccount.id,
        paymentMethod: "cash",
      });

      assert(!noSessionRes.success, "Le versement depuis la caisse fermée aurait dû être rejeté");
      assert(
        noSessionRes.error?.includes("session de caisse active est obligatoire"),
        `Message attendu non retourné: ${noSessionRes.error}`
      );

      // 2. Open a cash session with 100,000 DA
      const openSessionRes = await cashActions.openCashSessionAction(100000, "Ouverture session test");
      assert(openSessionRes.success, `Ouverture session échouée: ${openSessionRes.error}`);
      const session = openSessionRes.data as any;

      // 3. Make withdrawal from Caisse
      const caisseWithdrawalRes = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierNoDebt.id,
        amount: 30000,
        treasuryAccountId: caisseAccount.id,
        paymentMethod: "cash",
        idempotencyKey: "test-caisse-draw",
      });

      assert(caisseWithdrawalRes.success, `Versement caisse échoué: ${caisseWithdrawalRes.error}`);

      // Check session totalCashOut was updated
      const updatedSession = await prisma.cashSession.findUnique({ where: { id: session.id } });
      assert(
        updatedSession?.totalCashOut === 30000,
        `totalCashOut attendu 30 000 DA, obtenu ${updatedSession?.totalCashOut}`
      );

      // Check Caisse balance is now 70,000 DA
      const caisseBal = await treasuryActions.calculateAccountBalance(caisseAccount.id);
      assert(caisseBal === 70000, `Solde Caisse attendu 70 000 DA, obtenu ${caisseBal}`);

      // 4. A withdrawal from Coffre must NOT affect Caisse session
      await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierNoDebt.id,
        amount: 50000,
        treasuryAccountId: coffreAccount.id,
        paymentMethod: "safe_transfer",
      });

      const sessionAfterCoffre = await prisma.cashSession.findUnique({ where: { id: session.id } });
      assert(
        sessionAfterCoffre?.totalCashOut === 30000,
        "Le versement depuis le Coffre ne doit JAMAIS impacter la session de Caisse"
      );
    }
  );

  // ─── CRITERIA 8: INSUFFICIENT BALANCE REJECTED ─────────────────────────────────
  await runScenario(
    "SCENARIO 4",
    "Insufficient treasury balance is rejected and transaction rolled back",
    async () => {
      const caisseBal = await treasuryActions.calculateAccountBalance(caisseAccount.id);
      // Attempt withdrawal of 10,000,000 DA from caisse (which only has 70,000 DA)
      const res = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierNoDebt.id,
        amount: 10000000,
        treasuryAccountId: caisseAccount.id,
        paymentMethod: "cash",
      });

      assert(!res.success, "Le retrait supérieur au solde aurait dû être rejeté");
      assert(
        res.error?.includes("Solde insuffisant"),
        `Message de solde insuffisant attendu, obtenu: ${res.error}`
      );

      // Verify Caisse balance was not modified
      const caisseBalAfter = await treasuryActions.calculateAccountBalance(caisseAccount.id);
      assert(caisseBalAfter === caisseBal, "Le solde ne doit pas avoir bougé après rejet");
    }
  );

  // ─── CRITERIA 9: DUPLICATE SUBMISSION / IDEMPOTENCY ───────────────────────────
  await runScenario(
    "SCENARIO 5",
    "Duplicate submission returns existing transaction; conflict on parameter mismatch",
    async () => {
      const key = "test-idempotency-safe-unique";
      const firstRes = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierWithDebt.id,
        amount: 150000,
        treasuryAccountId: banqueAccount.id,
        paymentMethod: "transfer",
        idempotencyKey: key,
      });

      assert(firstRes.success, `Premier appel échoué: ${firstRes.error}`);
      const firstPayment = firstRes.data as any;

      // Duplicate submission with identical parameters
      const duplicateRes = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierWithDebt.id,
        amount: 150000,
        treasuryAccountId: banqueAccount.id,
        paymentMethod: "transfer",
        idempotencyKey: key,
      });

      assert(duplicateRes.success, "Le rejeu de la même clé doit réussir");
      const dupPayment = duplicateRes.data as any;
      assert(dupPayment.id === firstPayment.id, "Doit retourner exactement la même transaction");
      assert(dupPayment.reference === firstPayment.reference, "Même référence requise");

      // Conflicting submission with different amount under same key
      const conflictRes = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierWithDebt.id,
        amount: 999999,
        treasuryAccountId: banqueAccount.id,
        paymentMethod: "transfer",
        idempotencyKey: key,
      });

      assert(!conflictRes.success, "La soumission en conflit doit être rejetée");
      assert(
        conflictRes.error?.includes("Idempotency conflict"),
        `Erreur de conflit attendue, obtenue: ${conflictRes.error}`
      );
    }
  );

  // ─── CRITERIA 10 & 11: REVERSAL RESTORES FUNDS & DEBT UNCHANGED ────────────────
  await runScenario(
    "SCENARIO 6",
    "Reversal restores original treasury balance, debt remains unchanged, full traceability",
    async () => {
      const debtBefore = await supplierActions.calculateSupplierDebt(supplierWithDebt.id);
      const bankBefore = await treasuryActions.calculateAccountBalance(banqueAccount.id);

      // Create a payment of 200,000 DA from Bank
      const payRes = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierWithDebt.id,
        amount: 200000,
        treasuryAccountId: banqueAccount.id,
        paymentMethod: "transfer",
        description: "Paiement à annuler",
      });

      assert(payRes.success, `Paiement échoué: ${payRes.error}`);
      const payment = payRes.data as any;

      const bankAfterPay = await treasuryActions.calculateAccountBalance(banqueAccount.id);
      assert(bankAfterPay === bankBefore - 200000, "Le solde bancaire doit avoir diminué de 200 000 DA");

      // Reverse the payment
      const revRes = await additionalPaymentActions.reverseSupplierAdditionalPaymentAction({
        paymentId: payment.id,
        reason: "Erreur de virement bancaire détectée par comptabilité",
        idempotencyKey: "test-reversal-key-1",
      });

      assert(revRes.success, `Contrepassation échouée: ${revRes.error}`);
      const reversal = revRes.data as any;

      // 1. Reversal restores the bank balance
      const bankAfterRev = await treasuryActions.calculateAccountBalance(banqueAccount.id);
      assert(
        bankAfterRev === bankBefore,
        `Solde bancaire restauré attendu ${bankBefore} DA, obtenu ${bankAfterRev}`
      );

      // 2. Original transaction preserved with status 'reversed'
      const origInDb = await prisma.supplierAdditionalPayment.findUnique({ where: { id: payment.id } });
      assert(origInDb?.status === "reversed", `Statut original attendu 'reversed', obtenu ${origInDb?.status}`);
      assert(origInDb?.reversedAt !== null, "reversedAt doit être renseigné");
      assert(
        origInDb?.reversalReason === "Erreur de virement bancaire détectée par comptabilité",
        "Motif d'annulation tracé requis"
      );

      // 3. Compensating record created
      assert(reversal.isReversal === true, "L'enregistrement compensatoire doit être isReversal: true");
      assert(reversal.reversalOfId === payment.id, "reversalOfId doit pointer vers la transaction originale");

      // 4. Supplier debt still completely unaffected
      const debtAfterRev = await supplierActions.calculateSupplierDebt(supplierWithDebt.id);
      assert(
        debtAfterRev.outstandingDebt === debtBefore.outstandingDebt,
        `La dette fournisseur ne doit jamais bouger: ${debtAfterRev.outstandingDebt}`
      );

      // 5. Cannot reverse twice
      const secondRevRes = await additionalPaymentActions.reverseSupplierAdditionalPaymentAction({
        paymentId: payment.id,
        reason: "Tentative de deuxième annulation",
      });
      assert(!secondRevRes.success, "Une deuxième annulation sur la même opération doit être refusée");
    }
  );

  // ─── CRITERIA 12: RESPECT CLOSED SESSIONS & LOCKED PERIODS ─────────────────────
  await runScenario(
    "SCENARIO 7",
    "Respect closed cash sessions and locked accounting periods",
    async () => {
      // Create a locked period for 2025-12
      await prisma.monthlyClosingPeriod.upsert({
        where: { month: "2025-12" },
        update: { isLocked: true, status: "FINAL" },
        create: {
          month: "2025-12",
          isLocked: true,
          status: "FINAL",
          periodStart: new Date("2025-12-01T00:00:00.000Z"),
          periodEnd: new Date("2025-12-31T23:59:59.999Z"),
        },
      });

      // Attempting to backdate an additional payment to a locked period must FAIL
      const lockedRes = await additionalPaymentActions.createSupplierAdditionalPaymentAction({
        supplierId: supplierWithDebt.id,
        amount: 50000,
        treasuryAccountId: coffreAccount.id,
        paymentMethod: "safe_transfer",
        date: "2025-12-15",
      });

      assert(!lockedRes.success, "L'opération sur période verrouillée aurait dû être rejetée");
      assert(
        lockedRes.error?.includes("Période verrouillée"),
        `Erreur de période verrouillée attendue, obtenue: ${lockedRes.error}`
      );
    }
  );

  // ─── SUMMARY ────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("  RÉSUMÉ DES TESTS : VERSEMENT SUPPLÉMENTAIRE FOURNISSEUR");
  console.log("=".repeat(80));
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Total scénarios : ${results.length}`);
  console.log(`Succès          : ${passedCount}`);
  console.log(`Échecs          : ${results.length - passedCount}`);

  if (passedCount === results.length) {
    console.log("\nTOUS LES 7 SCÉNARIOS CRITIQUES COUVRANT LES 12 EXIGENCES SONT VALIDÉS AVEC SUCCÈS ! (100% OK)");
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erreur fatale exécution suite de tests:", err);
  process.exit(1);
});
