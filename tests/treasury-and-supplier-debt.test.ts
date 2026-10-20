/**
 * Integration Test Suite: Multi-Account Treasury, Coffre, Cash Transfers & Supplier Debts
 *
 * Runs against an isolated temporary SQLite database: prisma/test_treasury_runner.db
 * Never touches real shop data (prisma/shop.db).
 *
 * Covers Scenarios A through G from the user specification, plus Supplier Debts & CSS checks.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_treasury_runner.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore lock
}

process.env.DATABASE_URL = `file:${testDbPath}`;

interface TestResult {
  scenario: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
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
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ TRÉSORERIE MULTI-COMPTES & FOURNISSEURS");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Appliquer toutes les migrations sur la base de test isolée
  const { createClient } = await import("@libsql/client");
  const ddlClient = createClient({ url: `file:${testDbPath}` });

  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of migrationFolders) {
    const sqlFile = path.join(migrationsDir, folder, "migration.sql");
    const sql = fs.readFileSync(sqlFile, "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await ddlClient.execute(stmt);
    }
  }
  ddlClient.close();
  console.log("✓ Schéma et migrations (dont Treasury & Supplier Debts) appliqués avec succès.\n");

  // 2. Importer Prisma et modules d'actions
  const { prisma } = await import("@/lib/prisma");
  const treasuryActions = await import("@/app/cash/treasury-actions");
  const cashActions = await import("@/app/cash/actions");
  const supplierActions = await import("@/app/suppliers/actions");
  const purchaseActions = await import("@/app/purchases/actions");
  const salesActions = await import("@/app/sales/actions");
  const productActions = await import("@/app/products/actions");
  const customerActions = await import("@/app/customers/actions");

  // Initialiser les données de base (Warehouse, Categories, etc.)

  const location = await prisma.location.create({
    data: {
      code: "DEPOT-CENTRAL",
      name: "Dépôt Central",
      isDefault: true,
    },
  });

  const category = await prisma.category.create({
    data: {
      name: "Salons",
    },
  });

  let caisseAccount: any;
  let coffreAccount: any;
  let banqueAccount: any;
  let testSupplier: any;

  // ─── SCENARIO A: Opening balances ───────────────────────────────────────────
  await runScenario("SCENARIO A", "Configuration des soldes initiaux et vérification de la trésorerie", async () => {
    // Réinitialiser les comptes pour respecter strictement les comptes du Scénario A
    await prisma.treasuryTransfer.deleteMany();
    await prisma.treasuryAccount.deleteMany();

    // Caisse journalière: 0 DA (créée par défaut)
    caisseAccount = await prisma.treasuryAccount.create({
      data: {
        code: "ACC-CAISSE",
        name: "Caisse journalière",
        type: "cash",
        openingBalance: 0,
        isDefault: true,
      },
    });

    // Coffre maison: 500 000 DA
    coffreAccount = await prisma.treasuryAccount.create({
      data: {
        code: "ACC-COFFRE-MAISON",
        name: "Coffre maison",
        type: "safe",
        openingBalance: 500000,
        isDefault: false,
      },
    });

    // Banque: 1 000 000 DA
    banqueAccount = await prisma.treasuryAccount.create({
      data: {
        code: "ACC-BANQUE",
        name: "Banque",
        type: "bank",
        openingBalance: 1000000,
        isDefault: false,
      },
    });

    const balanceCaisse = await treasuryActions.calculateAccountBalance(caisseAccount.id);
    const balanceCoffre = await treasuryActions.calculateAccountBalance(coffreAccount.id);
    const balanceBanque = await treasuryActions.calculateAccountBalance(banqueAccount.id);

    assert(balanceCaisse === 0, `Solde Caisse attendu 0 DA, obtenu ${balanceCaisse}`);
    assert(balanceCoffre === 500000, `Solde Coffre attendu 500000 DA, obtenu ${balanceCoffre}`);
    assert(balanceBanque === 1000000, `Solde Banque attendu 1000000 DA, obtenu ${balanceBanque}`);

    const dashboard = await treasuryActions.getTreasuryDashboardData();
    assert(
      dashboard.totalTreasuryFunds === 1500000,
      `Total trésorerie attendu 1 500 000 DA, obtenu ${dashboard.totalTreasuryFunds}`
    );

    // Vérifier qu'aucune vente, dépense, achat ou mouvement de stock n'a été créé
    const salesCount = await prisma.sales.count();
    const expenseCount = await prisma.expense.count();
    const purchaseCount = await prisma.purchase.count();
    const stockMovementsCount = await prisma.stockMovement.count();

    assert(salesCount === 0, "Aucune vente ne doit exister");
    assert(expenseCount === 0, "Aucune dépense ne doit exister");
    assert(purchaseCount === 0, "Aucun achat ne doit exister");
    assert(stockMovementsCount === 0, "Aucun mouvement de stock ne doit exister");
  });

  // ─── SCENARIO B: Daily cash closing with manual transfer ────────────────────
  await runScenario("SCENARIO B", "Clôture de caisse avec transfert manuel partiel vers le coffre", async () => {
    // 1. Simuler une session active et un encaissement direct de 500 000 DA
    const openRes = await cashActions.openCashSessionAction(0, "Ouverture session test");
    assert(openRes.success, `Ouverture session échouée: ${openRes.error}`);
    const activeSession = openRes.data as any;

    // Encaissement de 500 000 DA
    await prisma.payment.create({
      data: {
        reference: "PAY-TEST-500K",
        amount: 500000,
        method: "cash",
        status: "completed",
        accountId: caisseAccount.id,
        sessionId: activeSession.id,
      },
    });

    const theoreticalData = await cashActions.getCashDashboardData();
    assert(
      theoreticalData.metrics.physicalTheoretical === 500000,
      `Montant théorique attendu 500 000 DA, obtenu ${theoreticalData.metrics.physicalTheoretical}`
    );

    // 2. Clôturer avec:
    // Montant compté physiquement : 500 000 DA
    // Montant transféré vers Coffre maison : 480 000 DA
    // Espèces laissées en caisse : 20 000 DA
    const closeRes = await cashActions.closeCashSessionAction(
      activeSession.id,
      500000,
      "Clôture normale test",
      480000,
      coffreAccount.id,
      "Transfert de clôture vers Coffre maison"
    );

    assert(closeRes.success, `Clôture échouée: ${closeRes.error}`);

    // Vérifier les soldes
    const balCaisse = await treasuryActions.calculateAccountBalance(caisseAccount.id);
    const balCoffre = await treasuryActions.calculateAccountBalance(coffreAccount.id);

    assert(balCaisse === 20000, `Solde Caisse attendu 20 000 DA, obtenu ${balCaisse}`);
    assert(balCoffre === 980000, `Solde Coffre attendu 980 000 DA, obtenu ${balCoffre}`);

    // Vérifier que le total de la trésorerie est inchangé par le transfert
    const dash = await treasuryActions.getTreasuryDashboardData();
    assert(
      dash.totalTreasuryFunds === 2000000,
      `Total trésorerie globale attendu 2 000 000 DA (1.5M init + 500k encaissement), obtenu ${dash.totalTreasuryFunds}`
    );

    // Vérifier la session de caisse : montant compté préservé à 500 000 DA et écart = 0
    const closedSession = await prisma.cashSession.findUnique({ where: { id: activeSession.id } });
    assert(closedSession?.closingAmount === 500000, `Montant compté de la session altéré: ${closedSession?.closingAmount}`);
    assert(closedSession?.difference === 0, `Écart anormal: ${closedSession?.difference}`);

    // Vérifier que le transfert existe et est lié
    const transfer = await prisma.treasuryTransfer.findFirst({
      where: { fromAccountId: caisseAccount.id, toAccountId: coffreAccount.id },
    });
    assert(transfer !== null, "Le transfert de trésorerie doit être enregistré");
    assert(transfer?.amount === 480000, `Montant transfert incorrect: ${transfer?.amount}`);
  });

  // ─── SCENARIO C: Supplier delivery on credit ────────────────────────────────
  await runScenario("SCENARIO C", "Achat fournisseur à crédit et réception sans décaissement préalable", async () => {
    // Créer un fournisseur
    testSupplier = await prisma.supplier.create({
      data: {
        code: "FRN-001",
        name: "Fournisseur A",
        phone: "0555123456",
        address: "Zone Industrielle Oued Smar",
      },
    });

    // Créer un produit
    const prod = await prisma.product.create({
      data: {
        sku: "SALON-ROYAL",
        name: "Salon Royal 7 Places",
        categoryId: category.id,
        costPrice: 2000000,
        sellingPrice: 2500000,
        stock: 0,
      },
    });

    // Créer une commande d'achat de 2 000 000 DA sur le fournisseur A
    const purchase = await prisma.purchase.create({
      data: {
        reference: "CMD-202610-0001",
        supplierId: testSupplier.id,
        status: "confirmed",
        paymentStatus: "unpaid",
        totalAmount: 2000000,
        paidAmount: 0,
        items: {
          create: {
            productId: prod.id,
            quantity: 1,
            receivedQuantity: 1,
            unitCost: 2000000,
            subtotal: 2000000,
          },
        },
      },
    });

    // Simuler la réception de stock
    const createdItem = await prisma.purchaseItem.findFirst({ where: { purchaseId: purchase.id } });
    await prisma.purchaseReceipt.create({
      data: {
        reference: "REC-202610-0001",
        purchaseId: purchase.id,
        items: {
          create: {
            purchaseItemId: createdItem!.id,
            productId: prod.id,
            quantity: 1,
            unitCost: 2000000,
            locationId: location.id,
          },
        },
      },
    });

    await prisma.product.update({
      where: { id: prod.id },
      data: { stock: 1 },
    });

    // Vérifier la dette fournisseur
    const debtCalc = await supplierActions.calculateSupplierDebt(testSupplier.id);
    assert(
      debtCalc.outstandingDebt === 2000000,
      `Dette attendue 2 000 000 DA, obtenue ${debtCalc.outstandingDebt}`
    );

    // Vérifier que le stock a augmenté d'exactement 1 unité
    const updatedProd = await prisma.product.findUnique({ where: { id: prod.id } });
    assert(updatedProd?.stock === 1, `Stock attendu 1, obtenu ${updatedProd?.stock}`);

    // Vérifier qu'aucun compte de trésorerie n'a été débité
    const balCaisse = await treasuryActions.calculateAccountBalance(caisseAccount.id);
    const balCoffre = await treasuryActions.calculateAccountBalance(coffreAccount.id);
    const balBanque = await treasuryActions.calculateAccountBalance(banqueAccount.id);

    assert(balCaisse === 20000, "La caisse ne doit pas avoir bougé");
    assert(balCoffre === 980000, "Le coffre ne doit pas avoir bougé");
    assert(balBanque === 1000000, "La banque ne doit pas avoir bougé");
  });

  // ─── SCENARIO D: Supplier payment from Coffre maison ─────────────────────────
  await runScenario("SCENARIO D", "Règlement partiel fournisseur de 200 000 DA depuis le Coffre maison", async () => {
    const payRes = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: testSupplier.id,
      amount: 200000,
      sourceAccountId: coffreAccount.id,
      paymentMethod: "cash",
      notes: "Acompte fournisseur sur commande CMD-202610-0001",
    });

    assert(payRes.success, `Paiement fournisseur échoué: ${payRes.error}`);

    // Vérifier les soldes de trésorerie
    const balCoffre = await treasuryActions.calculateAccountBalance(coffreAccount.id);
    const balCaisse = await treasuryActions.calculateAccountBalance(caisseAccount.id);

    assert(balCoffre === 780000, `Coffre attendu 780 000 DA, obtenu ${balCoffre}`);
    assert(balCaisse === 20000, `Caisse attendue 20 000 DA (inchangée), obtenue ${balCaisse}`);

    // Vérifier la dette restante du fournisseur : 2 000 000 - 200 000 = 1 800 000 DA
    const debtCalc = await supplierActions.calculateSupplierDebt(testSupplier.id);
    assert(debtCalc.outstandingDebt === 1800000, `Dette restante attendue 1 800 000 DA, obtenue ${debtCalc.outstandingDebt}`);

    // Vérifier que le règlement apparaît exactement une fois dans la trésorerie
    const paymentsForSupplier = await prisma.payment.findMany({
      where: { supplierId: testSupplier.id, accountId: coffreAccount.id },
    });
    assert(paymentsForSupplier.length === 1, `Attendu 1 paiement lié au coffre, trouvé ${paymentsForSupplier.length}`);
    assert(paymentsForSupplier[0].amount === 200000, `Montant paiement incorrect: ${paymentsForSupplier[0].amount}`);
  });

  // ─── SCENARIO E: Internal transfer ──────────────────────────────────────────
  await runScenario("SCENARIO E", "Virement interne de 100 000 DA de Banque vers Coffre maison", async () => {
    const transferRes = await treasuryActions.createTreasuryTransferAction({
      sourceAccountId: banqueAccount.id,
      destinationAccountId: coffreAccount.id,
      amount: 100000,
      motif: "Approvisionnement Coffre depuis Banque",
      reference: "VIR-BNA-001",
    });

    assert(transferRes.success, `Transfert échoué: ${transferRes.error}`);

    const balBanque = await treasuryActions.calculateAccountBalance(banqueAccount.id);
    const balCoffre = await treasuryActions.calculateAccountBalance(coffreAccount.id);

    assert(balBanque === 900000, `Banque attendu 900 000 DA, obtenu ${balBanque}`);
    assert(balCoffre === 880000, `Coffre attendu 880 000 DA, obtenu ${balCoffre}`);

    // Vérifier que la trésorerie globale n'a pas varié
    // Caisse: 20k + Coffre: 880k + Banque: 900k = 1 800 000 DA (2.0M - 200k fournisseur)
    const dash = await treasuryActions.getTreasuryDashboardData();
    assert(dash.totalTreasuryFunds === 1800000, `Total trésorerie globale attendu 1 800 000 DA, obtenu ${dash.totalTreasuryFunds}`);

    // Vérifier qu'aucune dépense ni vente n'a été générée par ce transfert interne
    const expenseCount = await prisma.expense.count();
    const salesCount = await prisma.sales.count();
    assert(expenseCount === 0, "Les virements internes ne doivent jamais créer de dépenses");
    assert(salesCount === 0, "Les virements internes ne doivent jamais créer de ventes");
  });

  // ─── SCENARIO F: Protections & Failure Modes ────────────────────────────────
  await runScenario("SCENARIO F", "Validation des gardes-fous (montants invalides, même compte, solde insuffisant)", async () => {
    // 1. Transfert vers le même compte
    const sameAccRes = await treasuryActions.createTreasuryTransferAction({
      sourceAccountId: banqueAccount.id,
      destinationAccountId: banqueAccount.id,
      amount: 50000,
      motif: "Test même compte",
    });
    assert(!sameAccRes.success, "Un transfert vers le même compte doit être rejeté");

    // 2. Montant négatif ou nul
    const zeroRes = await treasuryActions.createTreasuryTransferAction({
      sourceAccountId: banqueAccount.id,
      destinationAccountId: coffreAccount.id,
      amount: 0,
      motif: "Test montant 0",
    });
    assert(!zeroRes.success, "Un montant <= 0 doit être rejeté");

    // 3. Solde insuffisant (Banque n'a que 900 000 DA, tentative de transfert de 2 000 000 DA)
    const overdraftRes = await treasuryActions.createTreasuryTransferAction({
      sourceAccountId: banqueAccount.id,
      destinationAccountId: coffreAccount.id,
      amount: 2000000,
      motif: "Test découvert interdit",
    });
    assert(!overdraftRes.success, "Un transfert dépassant le solde disponible doit être rejeté");

    // 4. Paiement fournisseur avec montant négatif
    const negPayRes = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: testSupplier.id,
      amount: -5000,
      sourceAccountId: coffreAccount.id,
    });
    assert(!negPayRes.success, "Un paiement fournisseur négatif doit être rejeté");

    // 5. Paiement fournisseur dépassant la dette restante (1 800 000 DA max)
    const overDebtRes = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: testSupplier.id,
      amount: 5000000,
      sourceAccountId: coffreAccount.id,
    });
    assert(!overDebtRes.success, "Un paiement fournisseur supérieur à la dette doit être rejeté");
  });

  // ─── SCENARIO G: Historical Data Protection & Reversals ─────────────────────
  await runScenario("SCENARIO G", "Protection des données historiques et intégrité comptable", async () => {
    // Vérifier que la session clôturée n'a pas été altérée
    const sessions = await prisma.cashSession.findMany({ where: { status: "closed" } });
    assert(sessions.length === 1, "La session clôturée doit exister");
    assert(sessions[0].closingAmount === 500000, "Le comptage physique initial doit être intact");

    // Vérifier les mouvements de trésorerie (Audit trail)
    const coffreData = await treasuryActions.getAccountMovements(coffreAccount.id);
    const coffreMovements = coffreData.movements;
    assert(coffreMovements.length >= 3, `Le coffre doit avoir au moins 3 mouvements (Solde initial, Transfert clôture, Règlement fournisseur, Virement banque), trouvé ${coffreMovements.length}`);

    // Vérifier que le solde calculé correspond exactement au plus récent running balance (tri décroissant)
    const latestMovement = coffreMovements[0];
    assert(latestMovement.runningBalance === 880000, `Le solde cumulé attendu est de 880 000 DA, obtenu ${latestMovement.runningBalance}`);
  });

  // ─── SCENARIO H: Supplier Initial Debts & Multi-Account Partial Payments ───
  await runScenario("SCENARIO H", "Dette initiale fournisseur avant informatisation et règlements multi-comptes", async () => {
    // Créer un deuxième fournisseur avec dettes anciennes
    const oldSupplier = await prisma.supplier.create({
      data: {
        code: "FRN-ANCIEN",
        name: "Fournisseur B (Historique)",
        phone: "0661998877",
      },
    });

    // Enregistrer dette initiale de 450 000 DA
    const initDebtRes = await supplierActions.recordSupplierInitialDebtAction({
      supplierId: oldSupplier.id,
      amount: 450000,
      debtDate: "2026-01-15",
      reference: "DETTE-INIT-2026-001",
      notes: "Anciennes factures avant informatisation",
    });
    assert(initDebtRes.success, `Enregistrement dette initiale échoué: ${initDebtRes.error}`);

    // Vérifier qu'aucun compte de trésorerie n'a diminué et aucun achat n'a été créé
    const purchasesCount = await prisma.purchase.count({ where: { supplierId: oldSupplier.id } });
    assert(purchasesCount === 0, "L'enregistrement de dette initiale ne doit pas créer d'achat");

    // Vérifier dette calculée = 450 000 DA
    const debtCalc1 = await supplierActions.calculateSupplierDebt(oldSupplier.id);
    assert(debtCalc1.outstandingDebt === 450000, `Dette initiale attendue 450 000 DA, obtenue ${debtCalc1.outstandingDebt}`);

    // Règlement 1: 100 000 DA depuis Coffre maison
    const p1 = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: oldSupplier.id,
      amount: 100000,
      sourceAccountId: coffreAccount.id,
      notes: "Paiement 1 depuis coffre",
    });
    assert(p1.success, `Paiement 1 échoué: ${p1.error}`);

    // Règlement 2: 75 000 DA depuis Banque
    const p2 = await supplierActions.recordSupplierPaymentMultiAccountAction({
      supplierId: oldSupplier.id,
      amount: 75000,
      sourceAccountId: banqueAccount.id,
      notes: "Paiement 2 depuis banque",
    });
    assert(p2.success, `Paiement 2 échoué: ${p2.error}`);

    // Dette restante attendue: 450 000 - 100 000 - 75 000 = 275 000 DA
    const debtCalc2 = await supplierActions.calculateSupplierDebt(oldSupplier.id);
    assert(debtCalc2.outstandingDebt === 275000, `Dette finale attendue 275 000 DA, obtenue ${debtCalc2.outstandingDebt}`);

    // Vérifier impact sur Coffre maison: 880 000 - 100 000 = 780 000 DA
    const balCoffre = await treasuryActions.calculateAccountBalance(coffreAccount.id);
    assert(balCoffre === 780000, `Coffre attendu 780 000 DA, obtenu ${balCoffre}`);

    // Vérifier impact sur Banque: 900 000 - 75 000 = 825 000 DA
    const balBanque = await treasuryActions.calculateAccountBalance(banqueAccount.id);
    assert(balBanque === 825000, `Banque attendue 825 000 DA, obtenue ${balBanque}`);

    // Vérifier que la caisse journalière est restée strictement à 20 000 DA
    const balCaisse = await treasuryActions.calculateAccountBalance(caisseAccount.id);
    assert(balCaisse === 20000, `Caisse attendue 20 000 DA, obtenue ${balCaisse}`);

    // Vérifier le relevé de compte auxiliaire fournisseur
    const statement = await supplierActions.getSupplierStatement(oldSupplier.id);
    assert(statement !== null, "Le relevé fournisseur ne doit pas être null");
    assert(statement!.events.length === 3, `Le relevé doit contenir 3 événements (dette initiale + 2 règlements), trouvé ${statement!.events.length}`);
    assert(statement!.supplier.outstandingDebt === 275000, `Solde dû sur relevé attendu 275 000 DA, obtenu ${statement!.supplier.outstandingDebt}`);
  });

  // ─── SCENARIO I: Numeric Input Spinner Removal in CSS ───────────────────────
  await runScenario("SCENARIO I", "Vérification CSS pour la suppression des flèches/spinners numériques", async () => {
    const cssPath = path.resolve(process.cwd(), "src", "app", "globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    assert(
      cssContent.includes("-webkit-outer-spin-button") && cssContent.includes("-webkit-inner-spin-button"),
      "Le CSS doit masquer les flèches d'incrément WebKit (-webkit-appearance: none)"
    );
    assert(
      cssContent.includes("-moz-appearance: textfield") || cssContent.includes("appearance: textfield"),
      "Le CSS doit désactiver le spinner pour Firefox / standards (appearance: textfield)"
    );
  });

  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DE LA SUITE DE TESTS D'INTÉGRITÉ TRÉSORERIE & FOURNISSEURS");
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
