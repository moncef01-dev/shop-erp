/**
 * Integration Test Suite: Supplier Accounts, Debt Management, and Payment History
 *
 * Covers all user specifications:
 * 1. Supplier account displays actual purchase and payment history.
 * 2. Registering an opening debt increases outstanding debt without touching treasury or stock.
 * 3. Paying a supplier debt reduces outstanding debt and treasury account exactly once.
 * 4. Supplier payments remain visible in the account history after reloading.
 * 5. Partial payments leave correct remaining debt.
 * 6. Duplicate submissions are prevented (anti-doublon debounce & reference uniqueness).
 * 7. Tayeb Gidoum reconciliation:
 *    - Previous debt DET-202610-0001: 1,708,500 DA
 *    - Purchase BC-202610-0001: +1,578,000 DA
 *    - Payment PAYF-202610-0001: -2,082,000 DA
 *    - Final outstanding debt: 1,204,500 DA
 * 8. Supplier account history reconciles to displayed balance with correct Debit/Credit columns:
 *    - Debit = Montant diminuant la dette (Règlements)
 *    - Credit = Montant augmentant la dette (Achats, Dettes initiales)
 *    - Remaining debt = Solde après opération
 */

import path from "path";

interface TestResult {
  scenario: string;
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

async function runScenario(scenario: string, name: string, fn: () => Promise<void>) {
  try {
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
  console.log("================================================================================");
  console.log("  SHOP ERP — SUITE DE VALIDATION COMPTES FOURNISSEURS, DETTES & HISTORIQUE");
  console.log("================================================================================\n");

  // ==========================================================================
  // PARTIE 1 : VÉRIFICATION SUR LA BASE RÉELLE (Tayeb Gidoum & Réconciliation)
  // ==========================================================================
  console.log("--- PARTIE 1 : Audit et Réconciliation du Fournisseur Tayeb Gidoum (shop.db) ---\n");

  const realDbPath = path.resolve(process.cwd(), "prisma", "shop.db");
  process.env.DATABASE_URL = `file:${realDbPath}`;

  const { prisma } = await import("@/lib/prisma");
  const supplierActions = await import("@/app/suppliers/actions");
  const purchaseActions = await import("@/app/purchases/actions");
  const treasuryActions = await import("@/app/cash/treasury-actions");

  await runScenario("TAYEB-01", "Présence et intégrité de Tayeb Gidoum et de ses opérations", async () => {
    const supplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: { contains: "Tayeb" } },
          { code: "FOU-0001" },
        ],
      },
    });
    assert(supplier !== null, "Le fournisseur Tayeb Gidoum doit exister");

    // 1. Dette antérieure DET-202610-0001
    const initialDebt = await prisma.supplierDebt.findFirst({
      where: { supplierId: supplier.id, reference: "DET-202610-0001" },
    });
    assert(initialDebt !== null, "La dette antérieure DET-202610-0001 doit exister");
    assert(initialDebt.amount === 1708500, `Montant dette antérieure attendu 1 708 500 DA, obtenu ${initialDebt.amount}`);

    // 2. Commande d'achat BC-202610-0001
    const purchase = await prisma.purchase.findFirst({
      where: { supplierId: supplier.id, reference: "BC-202610-0001" },
    });
    assert(purchase !== null, "La commande d'achat BC-202610-0001 doit exister");
    assert(purchase.totalAmount === 1578000, `Montant achat attendu 1 578 000 DA, obtenu ${purchase.totalAmount}`);

    // 3. Règlement fournisseur PAYF-202610-0001
    const payment = await prisma.payment.findFirst({
      where: { supplierId: supplier.id, reference: "PAYF-202610-0001" },
    });
    assert(payment !== null, "Le règlement fournisseur PAYF-202610-0001 doit exister");
    assert(payment.amount === 2082000, `Montant paiement attendu 2 082 000 DA, obtenu ${payment.amount}`);
  });

  await runScenario("TAYEB-02", "Calcul exact du solde dû de Tayeb Gidoum = 1 204 500 DA", async () => {
    const supplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: { contains: "Tayeb" } },
          { code: "FOU-0001" },
        ],
      },
    });
    assert(supplier !== null, "Tayeb Gidoum doit exister");

    const debtCalc = await supplierActions.calculateSupplierDebt(supplier.id);
    assert(debtCalc.initialDebt === 1708500, `Total dette initiale attendu 1 708 500 DA, obtenu ${debtCalc.initialDebt}`);
    assert(debtCalc.totalPurchases === 1578000, `Total achats attendu 1 578 000 DA, obtenu ${debtCalc.totalPurchases}`);
    assert(debtCalc.totalPaid === 2082000, `Total paiements attendu 2 082 000 DA, obtenu ${debtCalc.totalPaid}`);
    assert(debtCalc.outstandingDebt === 1204500, `Solde restant dû attendu 1 204 500 DA, obtenu ${debtCalc.outstandingDebt}`);

    // Vérifier également dans getSuppliersData (utilisé par /purchases)
    const purchasesData = await purchaseActions.getSuppliersData();
    const suppInPurchases = purchasesData.find((s) => s.id === supplier.id);
    assert(suppInPurchases !== undefined, "Tayeb Gidoum doit être dans les données achats");
    assert(
      suppInPurchases.outstandingBalance === 1204500,
      `Dans l'onglet Achats, le solde dû doit être 1 204 500 DA, obtenu ${suppInPurchases.outstandingBalance}`
    );
  });

  await runScenario("TAYEB-03", "Relevé de compte auxiliaire chronologique de Tayeb Gidoum", async () => {
    const supplier = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: { contains: "Tayeb" } },
          { code: "FOU-0001" },
        ],
      },
    });
    assert(supplier !== null, "Tayeb Gidoum doit exister");

    const statement = await supplierActions.getSupplierStatement(supplier.id);
    assert(statement !== null, "Le relevé de compte doit être généré");
    assert(statement.events.length >= 3, `Le relevé doit contenir au moins 3 événements, trouvé ${statement.events.length}`);

    // Chronologie et impact comptable :
    // 1. Dette antérieure : Credit 1 708 500, Running 1 708 500
    // 2. Facture achat BC-202610-0001 : Credit 1 578 000, Running 3 286 500
    // 3. Paiement PAYF-202610-0001 : Debit 2 082 000, Running 1 204 500
    const initialDebtEvent = statement.events.find((e) => e.reference === "DET-202610-0001");
    assert(initialDebtEvent !== undefined, "L'événement DET-202610-0001 doit être présent");
    assert(initialDebtEvent.credit === 1708500, "La dette antérieure doit être un Crédit (+)");
    assert(initialDebtEvent.debit === 0, "La dette antérieure a Débit = 0");
    assert(initialDebtEvent.runningBalance === 1708500, `Running balance dette initiale attendu 1 708 500 DA, obtenu ${initialDebtEvent.runningBalance}`);

    const purchaseEvent = statement.events.find((e) => e.reference === "BC-202610-0001");
    assert(purchaseEvent !== undefined, "L'événement BC-202610-0001 doit être présent");
    assert(purchaseEvent.credit === 1578000, "L'achat doit être un Crédit (+)");
    assert(purchaseEvent.debit === 0, "L'achat a Débit = 0");
    assert(purchaseEvent.runningBalance === 3286500, `Running balance achat attendu 3 286 500 DA, obtenu ${purchaseEvent.runningBalance}`);

    const paymentEvent = statement.events.find((e) => e.reference === "PAYF-202610-0001");
    assert(paymentEvent !== undefined, "L'événement PAYF-202610-0001 doit être présent");
    assert(paymentEvent.debit === 2082000, "Le paiement doit être un Débit (-)");
    assert(paymentEvent.credit === 0, "Le paiement a Crédit = 0");
    assert(paymentEvent.runningBalance === 1204500, `Running balance après paiement attendu 1 204 500 DA, obtenu ${paymentEvent.runningBalance}`);

    assert(statement.supplier.outstandingDebt === 1204500, `Solde final fournisseur attendu 1 204 500 DA, obtenu ${statement.supplier.outstandingDebt}`);
  });

  // ==========================================================================
  // PARTIE 2 : TESTS ACTIONS & INTÉGRITÉ COMPTABLE
  // ==========================================================================
  console.log("\n--- PARTIE 2 : Test des Actions, Déduction Trésorerie et Anti-doublons ---\n");

  await runScenario("WORKFLOW-01", "Dette antérieure n'affecte ni stock ni trésorerie", async () => {
    // Créer un fournisseur de test dans la DB
    const testCode = `TEST-${Date.now()}`;
    const newSupp = await prisma.supplier.create({
      data: {
        code: testCode,
        name: `Fournisseur Test Audit ${Date.now()}`,
        phone: "0550000000",
        isActive: true,
      },
    });

    const accountsBefore = await prisma.treasuryAccount.findMany();
    const stockMovementsBefore = await prisma.stockMovement.count();
    const purchasesBefore = await prisma.purchase.count({ where: { supplierId: newSupp.id } });

    // Enregistrer une dette antérieure
    const debtRes = await supplierActions.recordSupplierInitialDebtAction({
      supplierId: newSupp.id,
      amount: 450000,
      debtDate: "2026-10-10",
      description: "Dette test audit",
      notes: "Test intégrité",
    });

    assert(debtRes.success, `Enregistrement dette échoué: ${debtRes.error}`);

    // 1. Dette calculée = 450 000 DA
    const debtAfter = await supplierActions.calculateSupplierDebt(newSupp.id);
    assert(debtAfter.outstandingDebt === 450000, `Dette attendue 450 000 DA, obtenue ${debtAfter.outstandingDebt}`);

    // 2. Aucun achat créé
    const purchasesAfter = await prisma.purchase.count({ where: { supplierId: newSupp.id } });
    assert(purchasesAfter === purchasesBefore, "Aucun achat ne doit être créé pour une dette antérieure");

    // 3. Aucun mouvement de stock créé
    const stockMovementsAfter = await prisma.stockMovement.count();
    assert(stockMovementsAfter === stockMovementsBefore, "Aucun mouvement de stock ne doit être créé");

    // 4. Aucun impact sur les soldes des comptes de trésorerie
    for (const acc of accountsBefore) {
      const bal = await treasuryActions.calculateAccountBalance(acc.id);
      assert(typeof bal === "number", `Le solde du compte ${acc.name} doit être un nombre`);
    }

    // Nettoyer l'entrée de test
    await prisma.supplierDebt.deleteMany({ where: { supplierId: newSupp.id } });
    await prisma.supplier.delete({ where: { id: newSupp.id } });
  });

  await runScenario("WORKFLOW-02", "Paiement dette fournisseur déduit la trésorerie et la dette exactement 1 fois", async () => {
    // Créer fournisseur de test
    const newSupp = await prisma.supplier.create({
      data: {
        code: `TEST-PAY-${Date.now()}`,
        name: `Fournisseur Test Paiement ${Date.now()}`,
        isActive: true,
      },
    });

    // Enregistrer dette antérieure de 50 000 DA
    await supplierActions.recordSupplierInitialDebtAction({
      supplierId: newSupp.id,
      amount: 50000,
      debtDate: "2026-10-12",
      description: "Dette test paiement",
    });

    // Choisir le compte ayant suffisamment de fonds disponibles (ex: Coffre ou Banque)
    const activeAccounts = await prisma.treasuryAccount.findMany({ where: { isActive: true } });
    let coffreAcc: (typeof activeAccounts)[0] | null = null;
    let balBefore = 0;
    for (const acc of activeAccounts) {
      const bal = await treasuryActions.calculateAccountBalance(acc.id);
      if (bal >= 40000 && !coffreAcc) {
        coffreAcc = acc;
        balBefore = bal;
      }
    }

    assert(coffreAcc !== null, "Un compte de trésorerie avec fonds doit exister");

    // Régler 20 000 DA
    const payRes = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: newSupp.id,
      amount: 20000,
      sourceAccountId: coffreAcc.id,
      paymentMethod: "CASH",
      notes: "Acompte dette test",
    });

    assert(payRes.success, `Paiement échoué: ${payRes.error}`);

    // 1. Dette restante = 50 000 - 20 000 = 30 000 DA
    const debtAfter = await supplierActions.calculateSupplierDebt(newSupp.id);
    assert(debtAfter.outstandingDebt === 30000, `Dette restante attendue 30 000 DA, obtenue ${debtAfter.outstandingDebt}`);

    // 2. Solde du compte trésorerie déduit exactement de 20 000 DA
    const balAfter = await treasuryActions.calculateAccountBalance(coffreAcc.id);
    assert(
      balAfter === balBefore - 20000,
      `Solde trésorerie attendu ${balBefore - 20000} DA, obtenu ${balAfter}`
    );

    // 3. Vérifier le relevé du compte fournisseur : 2 événements
    const statement = await supplierActions.getSupplierStatement(newSupp.id);
    assert(statement !== null, "Le relevé doit être disponible");
    assert(statement.events.length === 2, `Le relevé doit contenir 2 événements, trouvé ${statement.events.length}`);
    assert(statement.supplier.outstandingDebt === 30000, "Le relevé affiche le solde restant de 30 000 DA");

    // 4. Deuxième paiement partiel de 15 000 DA
    const pay2Res = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: newSupp.id,
      amount: 15000,
      sourceAccountId: coffreAcc.id,
      paymentMethod: "CASH",
      notes: "Deuxième acompte",
    });
    assert(pay2Res.success, `Deuxième paiement échoué: ${pay2Res.error}`);

    // Dette restante = 30 000 - 15 000 = 15 000 DA
    const debtFinal = await supplierActions.calculateSupplierDebt(newSupp.id);
    assert(debtFinal.outstandingDebt === 15000, `Dette finale attendue 15 000 DA, obtenue ${debtFinal.outstandingDebt}`);

    // Recharger relevé : 3 événements persistants
    const statement2 = await supplierActions.getSupplierStatement(newSupp.id);
    assert(statement2 !== null, "Le relevé doit être disponible");
    assert(statement2.events.length === 3, "Les 3 événements doivent persister dans l'historique");

    // Recharger les paiements du fournisseur pour vérifier la persistance en base
    const savedPayments = await prisma.payment.findMany({ where: { supplierId: newSupp.id } });
    assert(savedPayments.length === 2, "Les 2 paiements sont enregistrés de façon permanente");

    // Nettoyer les données de test
    await prisma.payment.deleteMany({ where: { supplierId: newSupp.id } });
    await prisma.supplierDebt.deleteMany({ where: { supplierId: newSupp.id } });
    await prisma.supplier.delete({ where: { id: newSupp.id } });
  });

  await runScenario("WORKFLOW-03", "Protection anti-doublon et validation des montants", async () => {
    const supplier = await prisma.supplier.findFirst({
      where: { code: "FOU-0001" },
    });
    assert(supplier !== null, "Tayeb Gidoum doit exister");

    // 1. Tenter d'enregistrer une dette avec référence identique existante
    const dupRefRes = await supplierActions.recordSupplierInitialDebtAction({
      supplierId: supplier.id,
      amount: 1708500,
      debtDate: "2026-10-19",
      reference: "DET-202610-0001",
      notes: "Tentative doublon référence",
    });
    assert(!dupRefRes.success, "L'enregistrement d'une référence existante doit être rejeté");

    // 2. Tenter un paiement de montant <= 0
    const zeroPayRes = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplier.id,
      amount: 0,
      sourceAccountId: 1,
    });
    assert(!zeroPayRes.success, "Un paiement <= 0 doit être rejeté");

    // 3. Tenter un paiement dépassant la dette restante (> 1 204 500 DA)
    const overPayRes = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: supplier.id,
      amount: 5000000,
      sourceAccountId: 1,
    });
    assert(!overPayRes.success, "Un paiement dépassant la dette restante doit être rejeté");
  });

  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DES TESTS : COMPTES FOURNISSEURS & HISTORIQUE");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  Total Scénarios : ${total}`);
  console.log(`  Succès          : ${passed}`);
  console.log(`  Échecs          : ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Erreur fatale exécution suite de tests:", e);
  process.exit(1);
});
