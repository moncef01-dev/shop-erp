/**
 * Integration Test Suite: Supplier Overpayment & Multi-Account Credit Logic (Lot B)
 *
 * Verifies restored business rules:
 * 1. Single-account supplier payment overpayment accepted as supplier credit.
 * 2. Multi-account supplier payment overpayment accepted as supplier credit.
 * 3. Atomic execution, treasury debit integrity, and anti-doublon safeguards.
 * 4. calculateSupplierDebt accurately reflects outstanding credit without negative debt.
 * 5. Closed accounting periods and insufficient funds remain strictly rejected.
 * 6. Isolated test DB: prisma/test_supplier_overpayment.db (never touches shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_supplier_overpayment.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore lock
}

process.env.DATABASE_URL = `file:${testDbPath}`;

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  SHOP ERP — SUITE LOT B : TROP-PERÇU & CRÉDIT FOURNISSEUR MULTI-COMPTES");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Appliquer les migrations
  const { createClient } = await import("@libsql/client");
  const ddlClient = createClient({ url: `file:${testDbPath}` });

  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of migrationFolders) {
    const migrationFile = path.join(migrationsDir, folder, "migration.sql");
    if (fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, "utf-8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await ddlClient.execute(stmt);
      }
    }
  }

  // S'assurer que la table monthly_closing_periods existe pour les tests de période verrouillée
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
  console.log("✓ Schéma et migrations appliqués avec succès.\n");

  const { prisma } = await import("../src/lib/prisma");
  const purchaseActions = await import("../src/app/purchases/actions");
  const supplierActions = await import("../src/app/suppliers/actions");
  const { calculateAccountBalance } = await import("../src/server/repositories/cash.repository");

  // Initialiser les comptes de trésorerie (existants via migrations ou créés)
  const cashAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-CAISSE" },
    update: { openingBalance: 500000, isActive: true, isDefault: true },
    create: {
      name: "Caisse Magasin",
      code: "ACC-CAISSE",
      type: "cash",
      openingBalance: 500000,
      isDefault: true,
      isActive: true,
    },
  });

  const bankAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-BANQUE" },
    update: { openingBalance: 1000000, isActive: true, isDefault: false },
    create: {
      name: "Compte BNA",
      code: "ACC-BANQUE",
      type: "bank",
      openingBalance: 1000000,
      isDefault: false,
      isActive: true,
    },
  });

  const safeAccount = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-COFFRE" },
    update: { openingBalance: 200000, isActive: true, isDefault: false },
    create: {
      name: "Coffre Sécurisé",
      code: "ACC-COFFRE",
      type: "safe",
      openingBalance: 200000,
      isDefault: false,
      isActive: true,
    },
  });

  // Emplacement de stock
  const warehouse = await prisma.location.create({
    data: { name: "Dépôt Central", code: "DEP-01", isDefault: true, isActive: true },
  });

  // Fournisseur A
  const supplierA = await prisma.supplier.create({
    data: {
      name: "Fournisseur Bois Atlas",
      code: "FOU-0001",
      phone: "0555112233",
      isActive: true,
    },
  });

  // Fournisseur B
  const supplierB = await prisma.supplier.create({
    data: {
      name: "Fournisseur Metal Pro",
      code: "FOU-0002",
      phone: "0555445566",
      isActive: true,
    },
  });

  // Produit
  const productA = await prisma.product.create({
    data: {
      name: "Table Chêne Massif",
      sku: "TAB-CHENE-01",
      costPrice: 50000,
      sellingPrice: 85000,
      stock: 10,
      isActive: true,
    },
  });

  // Verrouillage comptable sur 2025-11 pour les tests de période
  await prisma.monthlyClosingPeriod.create({
    data: {
      month: "2025-11",
      status: "FINAL",
      isLocked: true,
      periodStart: new Date("2025-11-01T00:00:00.000Z"),
      periodEnd: new Date("2025-11-30T23:59:59.999Z"),
    },
  });

  async function executeTest(num: number, name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ num, name, passed: true });
      console.log(`  [TEST ${String(num).padStart(2, "0")}] PASS: ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ num, name, passed: false, error: msg });
      console.error(`  [TEST ${String(num).padStart(2, "0")}] FAIL: ${name}\n         Cause: ${msg}`);
    }
  }

  // ─── PARTIE 1 : WORKFLOW PAIEMENT UNIQUE (recordSupplierPaymentAction) ─────────

  let po1Id = 0;
  await executeTest(1, "Création d'une commande d'achat (100 000 DA)", async () => {
    const res = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplierA.id,
      items: [{ productId: productA.id, locationId: warehouse.id, quantity: 2, unitCost: 50000 }],
    });
    assert(res.success, `Échec création commande: ${res.error}`);
    po1Id = (res.data as { id: number }).id;
  });

  await executeTest(2, "Rejet strict des montants invalides (0 ou négatifs)", async () => {
    const fdZero = new FormData();
    fdZero.set("purchaseId", po1Id.toString());
    fdZero.set("amount", "0");
    const resZero = await purchaseActions.recordSupplierPaymentAction(fdZero);
    assert(!resZero.success, "Montant 0 aurait dû être rejeté");

    const fdNeg = new FormData();
    fdNeg.set("purchaseId", po1Id.toString());
    fdNeg.set("amount", "-15000");
    const resNeg = await purchaseActions.recordSupplierPaymentAction(fdNeg);
    assert(!resNeg.success, "Montant négatif aurait dû être rejeté");
  });

  await executeTest(3, "Règlement exact de facture (solde la commande sans crédit)", async () => {
    const fd = new FormData();
    fd.set("purchaseId", po1Id.toString());
    fd.set("amount", "100000");
    fd.set("method", "cash");
    fd.set("sourceAccountId", cashAccount.id.toString());
    fd.set("notes", "Paiement solde exact");

    const res = await purchaseActions.recordSupplierPaymentAction(fd);
    assert(res.success, `Échec paiement: ${res.error}`);

    const po = await prisma.purchase.findUnique({ where: { id: po1Id } });
    assert(po?.paidAmount === 100000, `Montant payé attendu 100000, obtenu: ${po?.paidAmount}`);
    assert(po?.paymentStatus === "paid", "Statut paiement attendu 'paid'");

    const debt = await supplierActions.calculateSupplierDebt(supplierA.id);
    assert(debt.outstandingDebt === 0, `Dette attendue 0, obtenue: ${debt.outstandingDebt}`);
    assert(debt.outstandingCredit === 0, `Crédit attendu 0, obtenu: ${debt.outstandingCredit}`);
  });

  let po2Id = 0;
  await executeTest(4, "Paiement excédentaire sur commande : accepté et génère du crédit fournisseur", async () => {
    // Créer commande de 80 000 DA
    const resOrder = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplierA.id,
      items: [{ productId: productA.id, locationId: warehouse.id, quantity: 2, unitCost: 40000 }],
    });
    assert(resOrder.success, "Création commande");
    po2Id = (resOrder.data as { id: number }).id;

    // Payer 120 000 DA (excédent de 40 000 DA)
    const fd = new FormData();
    fd.set("purchaseId", po2Id.toString());
    fd.set("amount", "120000");
    fd.set("method", "transfer");
    fd.set("sourceAccountId", bankAccount.id.toString());
    fd.set("notes", "Règlement avec excédent");

    const res = await purchaseActions.recordSupplierPaymentAction(fd);
    assert(res.success, `Le trop-perçu doit être accepté: ${res.error}`);

    const pay = res.data as { notes: string };
    assert(
      pay.notes.includes("Crédit fournisseur") || pay.notes.includes("Excédent"),
      `Mention de crédit attendue dans les notes, reçues: ${pay.notes}`
    );

    const po = await prisma.purchase.findUnique({ where: { id: po2Id } });
    assert(po?.paidAmount === 120000, `paidAmount attendu 120000, obtenu: ${po?.paidAmount}`);
    assert(po?.paymentStatus === "paid", "Statut paiement attendu 'paid'");

    const debt = await supplierActions.calculateSupplierDebt(supplierA.id);
    assert(debt.outstandingDebt === 0, `Dette attendue 0, obtenue: ${debt.outstandingDebt}`);
    assert(debt.outstandingCredit === 40000, `Crédit fournisseur attendu 40000, obtenu: ${debt.outstandingCredit}`);
  });

  await executeTest(5, "Paiement dépassant la dette totale fournisseur (crédit intégral)", async () => {
    // Dette = 0, Crédit actuel = 40 000 DA. Nouveau versement de 60 000 DA
    const fd = new FormData();
    fd.set("supplierId", supplierA.id.toString());
    fd.set("amount", "60000");
    fd.set("method", "transfer");
    fd.set("sourceAccountId", bankAccount.id.toString());
    fd.set("notes", "Acompte libre");

    const res = await purchaseActions.recordSupplierPaymentAction(fd);
    assert(res.success, `Paiement libre échoué: ${res.error}`);

    const debt = await supplierActions.calculateSupplierDebt(supplierA.id);
    assert(debt.outstandingDebt === 0, `Dette attendue 0, obtenue: ${debt.outstandingDebt}`);
    assert(debt.outstandingCredit === 100000, `Crédit cumulé attendu 100000 DA, obtenu: ${debt.outstandingCredit}`);
  });

  await executeTest(6, "Rejet sur période comptable verrouillée (Single-Account)", async () => {
    const fd = new FormData();
    fd.set("supplierId", supplierA.id.toString());
    fd.set("amount", "10000");
    fd.set("paymentDate", "2025-11-15");

    const res = await purchaseActions.recordSupplierPaymentAction(fd);
    assert(!res.success, "Le paiement sur période verrouillée aurait dû être rejeté");
  });

  // ─── PARTIE 2 : WORKFLOW MULTI-COMPTES (recordSupplierPaymentMultiAccountAction) ─

  let po3Id = 0;
  await executeTest(7, "Paiement ventilé sur deux comptes distincts (Caisse et Banque)", async () => {
    // Créer commande de 200 000 DA pour Supplier B
    const resOrder = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplierB.id,
      items: [{ productId: productA.id, locationId: warehouse.id, quantity: 4, unitCost: 50000 }],
    });
    assert(resOrder.success, "Création commande fournisseur B");
    po3Id = (resOrder.data as { id: number }).id;

    const caisseBefore = await calculateAccountBalance(cashAccount.id);
    const bankBefore = await calculateAccountBalance(bankAccount.id);

    // Paiement 1 : 80 000 DA depuis Caisse
    const pay1 = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplierB.id,
      purchaseId: po3Id,
      amount: 80000,
      sourceAccountId: cashAccount.id,
      method: "cash",
      notes: "Partie 1 en espèces",
    });
    assert(pay1.success, `Échec partie 1: ${pay1.error}`);

    // Paiement 2 : 120 000 DA depuis Banque
    const pay2 = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplierB.id,
      purchaseId: po3Id,
      amount: 120000,
      sourceAccountId: bankAccount.id,
      method: "transfer",
      notes: "Partie 2 par virement",
    });
    assert(pay2.success, `Échec partie 2: ${pay2.error}`);

    const po = await prisma.purchase.findUnique({ where: { id: po3Id } });
    assert(po?.paidAmount === 200000, `paidAmount attendu 200000, obtenu: ${po?.paidAmount}`);
    assert(po?.paymentStatus === "paid", "Statut attendu 'paid'");

    const caisseAfter = await calculateAccountBalance(cashAccount.id);
    const bankAfter = await calculateAccountBalance(bankAccount.id);
    assert(caisseAfter === caisseBefore - 80000, "Caisse débitée de 80 000 DA");
    assert(bankAfter === bankBefore - 120000, "Banque débitée de 120 000 DA");

    const debtB = await supplierActions.calculateSupplierDebt(supplierB.id);
    assert(debtB.outstandingDebt === 0, `Dette B attendue 0, obtenue: ${debtB.outstandingDebt}`);
    assert(debtB.outstandingCredit === 0, `Crédit B attendu 0, obtenu: ${debtB.outstandingCredit}`);
  });

  await executeTest(8, "Multi-comptes : paiement excédant la dette totale accepté en crédit fournisseur", async () => {
    // Supplier B a 0 dette. Versement de 50 000 DA depuis le coffre
    const safeBefore = await calculateAccountBalance(safeAccount.id);

    const payOver = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplierB.id,
      amount: 50000,
      sourceAccountId: safeAccount.id,
      method: "cash",
      notes: "Versement avance coffre",
    });
    assert(payOver.success, `Le trop-perçu doit être accepté en crédit: ${payOver.error}`);

    const payData = payOver.data as { notes: string };
    assert(
      payData.notes.includes("[Crédit fournisseur : 50 000 DA") || payData.notes.includes("Crédit fournisseur"),
      `Note de crédit fournisseur attendue, reçue: ${payData.notes}`
    );

    const safeAfter = await calculateAccountBalance(safeAccount.id);
    assert(safeAfter === safeBefore - 50000, "Coffre débité exactement de 50 000 DA");

    const debtB = await supplierActions.calculateSupplierDebt(supplierB.id);
    assert(debtB.outstandingDebt === 0, "Dette restante doit être 0");
    assert(debtB.outstandingCredit === 50000, `Crédit fournisseur attendu 50000 DA, obtenu: ${debtB.outstandingCredit}`);
  });

  await executeTest(9, "Rejet strict si solde compte insuffisant et rollback atomique complet", async () => {
    const safeBefore = await calculateAccountBalance(safeAccount.id);
    // Solde coffre = 150 000 DA. Demande de 900 000 DA
    const payFail = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplierB.id,
      amount: 900000,
      sourceAccountId: safeAccount.id,
    });
    assert(!payFail.success, "Paiement avec solde insuffisant doit échouer");
    assert(Boolean(payFail.error?.includes("Fonds insuffisants")), `Message fonds insuffisants attendu, reçu: ${payFail.error}`);

    const safeAfter = await calculateAccountBalance(safeAccount.id);
    assert(safeAfter === safeBefore, "Le solde du compte ne doit pas avoir bougé (rollback atomique)");

    const debtB = await supplierActions.calculateSupplierDebt(supplierB.id);
    assert(debtB.outstandingCredit === 50000, "Le crédit fournisseur doit être strictement inchangé");
  });

  await executeTest(10, "Protection anti-doublon rapide (15s) sur le même compte", async () => {
    // Même montant, même compte, même fournisseur
    const dupRes = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplierB.id,
      amount: 50000,
      sourceAccountId: safeAccount.id,
      notes: "Tentative doublon",
    });
    assert(!dupRes.success, "La soumission doublon doit être rejetée");
    assert(Boolean(dupRes.error?.includes("vient d'être validé")), `Message anti-doublon attendu, reçu: ${dupRes.error}`);
  });

  await executeTest(11, "Rejet sur période comptable verrouillée (Multi-Account)", async () => {
    const resLock = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplierB.id,
      amount: 10000,
      sourceAccountId: cashAccount.id,
      paymentDate: "2025-11-20",
    });
    assert(!resLock.success, "Paiement sur mois verrouillé doit être rejeté");
  });

  // ─── PARTIE 3 : INVARIANTS COMPTABLES ET CONSOMMATION DES CRÉDITS ────────────

  await executeTest(12, "Les nouveaux achats consomment naturellement le crédit fournisseur existant", async () => {
    // Supplier B a 50 000 DA de crédit. Création d'une commande de 30 000 DA
    const resOrder = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplierB.id,
      items: [{ productId: productA.id, locationId: warehouse.id, quantity: 1, unitCost: 30000 }],
    });
    assert(resOrder.success, "Création commande");

    // Nouvelle dette : totalPurchases = 200k + 30k = 230k. totalPaid = 200k + 50k = 250k.
    // Solde net = -20 000 DA -> outstandingDebt = 0, outstandingCredit = 20 000 DA
    const debtB = await supplierActions.calculateSupplierDebt(supplierB.id);
    assert(debtB.outstandingDebt === 0, `Dette attendue 0, obtenue: ${debtB.outstandingDebt}`);
    assert(debtB.outstandingCredit === 20000, `Crédit restant attendu 20 000 DA, obtenu: ${debtB.outstandingCredit}`);
  });

  await executeTest(13, "Audit de réconciliation globale trésorerie et paiements", async () => {
    // Vérifier que chaque paiement correspond exactement à un débit de trésorerie
    const allPayments = await prisma.payment.findMany({
      where: { status: { not: "cancelled" } },
    });
    const totalPaymentsAmount = allPayments.reduce((s, p) => s + p.amount, 0);

    // Initial balances : Caisse (500k) + Banque (1M) + Coffre (200k) = 1 700 000 DA
    const caisseNow = await calculateAccountBalance(cashAccount.id);
    const bankNow = await calculateAccountBalance(bankAccount.id);
    const safeNow = await calculateAccountBalance(safeAccount.id);
    const currentTreasuryTotal = caisseNow + bankNow + safeNow;

    const expectedTreasuryTotal = 1700000 - totalPaymentsAmount;
    assert(
      currentTreasuryTotal === expectedTreasuryTotal,
      `Trésorerie non réconciliée : Actuel=${currentTreasuryTotal}, Attendu=${expectedTreasuryTotal}, Sorties=${totalPaymentsAmount}`
    );
  });

  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DES TESTS : LOT B TROP-PERÇU ET CRÉDIT FOURNISSEUR");
  console.log("================================================================================");
  for (const r of results) {
    const status = r.passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${status} Test ${String(r.num).padStart(2, "0")} : ${r.name}`);
    if (r.error) {
      console.log(`         Cause: ${r.error}`);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`\nTOTAL: ${passedCount} / ${totalCount} tests réussis (${Math.round((passedCount / totalCount) * 100)}%).`);
  console.log("================================================================================\n");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
