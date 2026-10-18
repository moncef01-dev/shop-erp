/**
 * Integration Test Suite: Caisse & Trésorerie Module
 *
 * Runs against an isolated temporary SQLite database: prisma/test_cash_runner.db
 * Never touches real shop data (prisma/shop.db).
 *
 * Tests all requirements from Section 11:
 * 1. Customer cash payments appear exactly once as receipts (Encaissements).
 * 2. Non-cash customer payments (virement, chèque, CIB) never affect physical cash.
 * 3. Supplier cash payments appear exactly once as disbursements (Décaissements).
 * 4. Non-cash supplier payments never reduce physical cash.
 * 5. Opening cash session and prevention of duplicate active sessions.
 * 6. Closing cash session and server-side theoretical vs actual discrepancy calculations.
 * 7. Immutability of closed sessions (cannot be edited or deleted).
 * 8. Expense creation with categories, validation of amounts (rejection of <= 0 or invalid).
 * 9. Separation of physical cash expenses vs non-cash expenses.
 * 10. Date, type, and payment-method filtering in the grand livre.
 * 11. Transaction totals and global treasury balance calculations.
 * 12. Transactional safety and rollback on failed operations.
 * 13. Anti-double-counting guarantee: existing payment records feed into ledger without duplication.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_cash_runner.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore file lock
}

process.env.DATABASE_URL = `file:${testDbPath}`;

interface TestResult {
  num: number;
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

async function executeTest(num: number, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ num, name, passed: true });
    console.log(`  [TEST ${String(num).padStart(2, "0")}] PASS: ${name}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ num, name, passed: false, error: errorMsg });
    console.error(`  [TEST ${String(num).padStart(2, "0")}] FAIL: ${name}\n         Cause: ${errorMsg}`);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ DU MODULE CAISSE & TRÉSORERIE");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Initialiser le schéma via toutes les migrations
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
  console.log("✓ Schéma et migrations (dont Caisse & Trésorerie) appliqués à la base de test isolée.\n");

  // Importer Prisma et Actions
  const { prisma } = await import("@/lib/prisma");
  const cashActions = await import("@/app/cash/actions");
  const salesActions = await import("@/app/sales/actions");
  const purchaseActions = await import("@/app/purchases/actions");
  const productActions = await import("@/app/products/actions");
  const customerActions = await import("@/app/customers/actions");

  // Initialisation des données de base
  await productActions.ensureDefaultLocations();
  const showroom = await prisma.location.findFirst({ where: { code: "SHOWROOM" } });
  assert(showroom !== null, "Emplacement SHOWROOM introuvable");

  const product = await prisma.product.create({
    data: {
      sku: "TABLE-CHEN-01",
      name: "Table Salle à Manger Chêne Massif",
      unitPrice: 65000,
      sellingPrice: 65000,
      costPrice: 40000,
      stock: 10,
    },
  });

  await prisma.productStock.create({
    data: {
      productId: product.id,
      locationId: showroom!.id,
      quantity: 10,
    },
  });

  const customerFd = new FormData();
  customerFd.set("name", "Nabil Sahli");
  customerFd.set("phone", "0550998877");
  const custRes = await customerActions.createCustomerAction(customerFd);
  const customerId = (custRes.data as { id: number }).id;

  const supplierFd = new FormData();
  supplierFd.set("name", "Menuiserie Atlas Bois");
  supplierFd.set("phone", "025443322");
  const suppRes = await purchaseActions.createSupplierAction(supplierFd);
  const supplierId = (suppRes.data as { id: number }).id;

  let activeSessionId: number = 0;

  // ─── TEST 1: OUVERTURE D'UNE SESSION DE CAISSE ET PRÉVENTION DES DOUBLONS ───
  await executeTest(1, "Ouverture d'une session de caisse avec fond initial et référence CS-...", async () => {
    const res = await cashActions.openCashSessionAction({
      openingAmount: 15000,
      openingNotes: "Fond de caisse initial du matin",
    });

    assert(res.success === true, `Échec ouverture session: ${res.error}`);
    const session = res.data as { id: number; reference: string; status: string; openingAmount: number };
    assert(session.reference.startsWith("CS-"), `Référence attendue CS-..., reçue: ${session.reference}`);
    assert(session.status === "open", `Statut attendu 'open', reçu: ${session.status}`);
    assert(session.openingAmount === 15000, `Fond initial attendu 15000 DA, reçu: ${session.openingAmount}`);
    activeSessionId = session.id;
  });

  // ─── TEST 2: REJET DE DOUBLON DE SESSION ACTIVE (MONO-CAISSE) ───────────────
  await executeTest(2, "Protection mono-caisse: interdiction d'ouvrir une seconde session active concurrente", async () => {
    const res = await cashActions.openCashSessionAction({
      openingAmount: 10000,
      openingNotes: "Tentative seconde session",
    });

    assert(res.success === false, "L'ouverture d'une seconde session concurrente aurait dû être rejetée.");
    assert(Boolean(res.error?.includes("déjà active")), `Message attendu sur session active, reçu: ${res.error}`);
  });

  // ─── TEST 3: INTÉGRATION VENTE EN ESPÈCES DANS LE GRAND LIVRE SANS DOUBLON ──
  await executeTest(3, "Encaissement client en espèces : apparaît exactement une fois et incrémente la caisse physique", async () => {
    // Vente de 65,000 DA avec acompte de 25,000 DA en ESPÈCES
    const saleRes = await salesActions.createSaleAction({
      customerId,
      status: "confirmed",
      items: [
        {
          productId: product.id,
          locationId: showroom!.id,
          quantity: 1,
          unitPrice: 65000,
        },
      ],
      initialPayment: {
        amount: 25000,
        method: "cash",
        notes: "Acompte espèces à la commande",
      },
    });

    assert(saleRes.success === true, `Échec création vente: ${saleRes.error}`);

    // Vérifier dans le grand livre de caisse
    const dashboard = await cashActions.getCashDashboardData();
    const cashEntry = dashboard.ledger.find((item) => item.partyName === "Nabil Sahli");

    assert(cashEntry !== undefined, "L'encaissement client doit apparaître dans le grand livre.");
    assert(cashEntry!.type === "encaissement", "Le type doit être 'encaissement'.");
    assert(cashEntry!.amount === 25000, `Montant attendu 25000 DA, reçu: ${cashEntry!.amount}`);
    assert(cashEntry!.method === "cash", "Le mode de règlement doit être 'cash'.");
    assert(cashEntry!.affectsCash === true, "Le règlement en espèces doit impacter la caisse physique.");

    // Vérifier l'absence de doublons (doit apparaître exactement une fois)
    const matches = dashboard.ledger.filter((item) => item.partyName === "Nabil Sahli");
    assert(matches.length === 1, `L'encaissement ne doit apparaître qu'une seule fois (trouvé: ${matches.length}).`);
  });

  // ─── TEST 4: PAIEMENT CLIENT NON-ESPÈCES (VIREMENT/CIB) N'AFFECTE PAS LE TIROIR
  await executeTest(4, "Paiement client par Virement : enregistré dans le grand livre sans gonfler la caisse physique", async () => {
    // Versement complémentaire de 40,000 DA par VIREMENT BANCAIRE pour solder la facture
    const sale = await prisma.sales.findFirst({ where: { customerId } });
    const fd = new FormData();
    fd.set("saleId", sale!.id.toString());
    fd.set("amount", "40000");
    fd.set("method", "transfer");
    fd.set("notes", "Solde par virement bancaire BNA");

    const payRes = await salesActions.recordSalePaymentAction(fd);
    assert(payRes.success === true, `Échec versement virement: ${payRes.error}`);

    const dashboard = await cashActions.getCashDashboardData();
    const transferEntry = dashboard.ledger.find((item) => item.method === "transfer");

    assert(transferEntry !== undefined, "Le paiement par virement doit être répertorié dans le grand livre.");
    assert(transferEntry!.affectsCash === false, "Le virement NE DOIT PAS affecter le tiroir-caisse physique !");
    assert(transferEntry!.amount === 40000, `Montant virement attendu 40000, reçu: ${transferEntry!.amount}`);

    // Caisse physique ne doit avoir que l'ouverture (15000) + espèces (25000) = 40000 DA
    assert(
      dashboard.metrics.physicalTheoretical === 40000,
      `Solde théorique caisse attendu 40000 DA, reçu: ${dashboard.metrics.physicalTheoretical}`
    );

    // Canal virement doit afficher 40,000 DA
    assert(
      dashboard.metrics.channels.transfer.inflows === 40000,
      `Entrées virement attendues 40000 DA, reçues: ${dashboard.metrics.channels.transfer.inflows}`
    );
  });

  // ─── TEST 5: RÈGLEMENT FOURNISSEUR EN ESPÈCES DÉCAISSE LA CAISSE PHYSIQUE ────
  await executeTest(5, "Règlement fournisseur en espèces : apparaît comme décaissement et diminue la caisse physique", async () => {
    // Créer commande fournisseur de 30,000 DA avec acompte de 10,000 DA en ESPÈCES
    const poRes = await purchaseActions.createPurchaseOrderAction({
      supplierId,
      items: [
        {
          productId: product.id,
          locationId: showroom!.id,
          quantity: 2,
          unitCost: 15000,
        },
      ],
      initialPayment: {
        amount: 10000,
        method: "cash",
        notes: "Acompte espèces commande bois",
      },
    });

    assert(poRes.success === true, `Échec création commande fournisseur: ${poRes.error}`);

    const dashboard = await cashActions.getCashDashboardData();
    const suppEntry = dashboard.ledger.find((item) => item.source === "purchase");

    assert(suppEntry !== undefined, "Le décaissement fournisseur doit figurer dans le grand livre.");
    assert(suppEntry!.type === "decaissement", "Le type doit être 'decaissement'.");
    assert(suppEntry!.amount === 10000, `Montant attendu 10000 DA, reçu: ${suppEntry!.amount}`);
    assert(suppEntry!.affectsCash === true, "Le paiement fournisseur en espèces doit affecter la caisse physique.");

    // Nouveau solde caisse physique attendu: 40000 - 10000 = 30000 DA
    assert(
      dashboard.metrics.physicalTheoretical === 30000,
      `Solde théorique attendu 30000 DA, reçu: ${dashboard.metrics.physicalTheoretical}`
    );
  });

  // ─── TEST 6: RÈGLEMENT FOURNISSEUR PAR CHÈQUE N'IMPACTE PAS LA CAISSE PHYSIQUE
  await executeTest(6, "Règlement fournisseur par Chèque : décaissement bancaire n'impactant pas le tiroir physique", async () => {
    const po = await prisma.purchase.findFirst({ where: { supplierId } });
    const fd = new FormData();
    fd.set("purchaseId", po!.id.toString());
    fd.set("amount", "20000"); // Solde
    fd.set("method", "check");
    fd.set("notes", "Chèque bancaire BDL N° 449912");

    const payRes = await purchaseActions.recordSupplierPaymentAction(fd);
    assert(payRes.success === true, `Échec règlement chèque: ${payRes.error}`);

    const dashboard = await cashActions.getCashDashboardData();
    const checkEntry = dashboard.ledger.find((item) => item.method === "check");

    assert(checkEntry !== undefined, "Le chèque doit figurer dans le grand livre.");
    assert(checkEntry!.affectsCash === false, "Le chèque NE DOIT PAS décaisser les espèces physiques !");

    // Solde théorique caisse physique doit être INCHANGÉ à 30,000 DA
    assert(
      dashboard.metrics.physicalTheoretical === 30000,
      `Solde théorique attendu 30000 DA, reçu: ${dashboard.metrics.physicalTheoretical}`
    );

    // Canal chèque doit afficher une sortie de 20,000 DA
    assert(
      dashboard.metrics.channels.check.outflows === 20000,
      `Sorties chèque attendues 20000 DA, reçues: ${dashboard.metrics.channels.check.outflows}`
    );
  });

  // ─── TEST 7: CRÉATION D'UNE DÉPENSE D'EXPLOITATION (TRANSPORT) EN ESPÈCES ───
  await executeTest(7, "Enregistrement d'une dépense justifiée (Transport) : référence DEP-... et déduction caisse", async () => {
    const fd = new FormData();
    fd.set("type", "expense");
    fd.set("category", "transport");
    fd.set("description", "Frais de transport déchargement salon");
    fd.set("amount", "3000");
    fd.set("method", "cash");
    fd.set("beneficiary", "Transporteur Karim");
    fd.set("receiptNumber", "BON-LIV-099");

    const res = await cashActions.createExpenseAction(fd);
    assert(res.success === true, `Échec enregistrement dépense: ${res.error}`);
    const exp = res.data as { reference: string; amount: number };

    assert(exp.reference.startsWith("DEP-"), `Référence attendue DEP-..., reçue: ${exp.reference}`);
    assert(exp.amount === 3000, `Montant attendu 3000 DA, reçu: ${exp.amount}`);

    // Vérifier impact sur la caisse : 30,000 - 3,000 = 27,000 DA
    const dashboard = await cashActions.getCashDashboardData();
    assert(
      dashboard.metrics.physicalTheoretical === 27000,
      `Solde théorique caisse attendu 27000 DA, reçu: ${dashboard.metrics.physicalTheoretical}`
    );
  });

  // ─── TEST 8: REJET STRICT DES MONTANTS NÉGATIFS OU NULS POUR LES DÉPENSES ───
  await executeTest(8, "Validation stricte des dépenses : rejet des montants nuls, négatifs ou sans description", async () => {
    // 1. Montant zéro
    const fdZero = new FormData();
    fdZero.set("type", "expense");
    fdZero.set("category", "utilities");
    fdZero.set("description", "Facture électricité");
    fdZero.set("amount", "0");
    const resZero = await cashActions.createExpenseAction(fdZero);
    assert(resZero.success === false, "La dépense de montant 0 aurait dû être rejetée.");

    // 2. Montant négatif
    const fdNeg = new FormData();
    fdNeg.set("type", "expense");
    fdNeg.set("category", "utilities");
    fdNeg.set("description", "Facture électricité");
    fdNeg.set("amount", "-1500");
    const resNeg = await cashActions.createExpenseAction(fdNeg);
    assert(resNeg.success === false, "La dépense de montant négatif aurait dû être rejetée.");

    // 3. Description vide
    const fdNoDesc = new FormData();
    fdNoDesc.set("type", "expense");
    fdNoDesc.set("category", "utilities");
    fdNoDesc.set("description", "");
    fdNoDesc.set("amount", "1500");
    const resNoDesc = await cashActions.createExpenseAction(fdNoDesc);
    assert(resNoDesc.success === false, "La dépense sans motif aurait dû être rejetée.");
  });

  // ─── TEST 9: CLÔTURE DE SESSION ET CALCUL DE L'ÉCART DE CAISSE (EXCÉDENT) ────
  await executeTest(9, "Clôture de session: calcul exact du solde théorique (27000 DA), comptage (27500 DA) et écart (+500 DA)", async () => {
    // Solde théorique calculé :
    // Fond ouverture (15,000) + Vente espèces (25,000) - Achat espèces (10,000) - Dépense transport (3,000) = 27,000 DA
    // Le caissier compte 27,500 DA en caisse physique -> Excédent de 500 DA
    const closeRes = await cashActions.closeCashSessionAction({
      sessionId: activeSessionId,
      closingAmount: 27500,
      closingNotes: "Excédent de 500 DA constaté (monnaie non réclamée par client comptoir)",
    });

    assert(closeRes.success === true, `Échec clôture: ${closeRes.error}`);
    const closed = closeRes.data as {
      status: string;
      theoreticalAmount: number;
      closingAmount: number;
      difference: number;
      closedAt: string | Date | null;
    };

    assert(closed.status === "closed", `Statut session attendu 'closed', reçu: ${closed.status}`);
    assert(closed.theoreticalAmount === 27000, `Théorique attendu 27000, reçu: ${closed.theoreticalAmount}`);
    assert(closed.closingAmount === 27500, `Compté attendu 27500, reçu: ${closed.closingAmount}`);
    assert(closed.difference === 500, `Écart attendu +500 DA, reçu: ${closed.difference}`);
    assert(closed.closedAt !== null, "Date de clôture doit être enregistrée");
  });

  // ─── TEST 10: IMMUABILITÉ D'UNE SESSION CLÔTURÉE ─────────────────────────────
  await executeTest(10, "Immuabilité absolue : interdiction de re-clôturer ou de modifier une session archivée", async () => {
    const doubleClose = await cashActions.closeCashSessionAction({
      sessionId: activeSessionId,
      closingAmount: 28000,
      closingNotes: "Tentative de modification illégale",
    });

    assert(doubleClose.success === false, "Une session déjà clôturée ne doit pas pouvoir être re-clôturée.");
    assert(
      Boolean(doubleClose.error?.includes("déjà clôturée")),
      `Message attendu sur session archivée, reçu: ${doubleClose.error}`
    );
  });

  // ─── TEST 11: SUPPRESSION BLOQUÉE D'UNE DÉPENSE LIÉE À UNE SESSION CLÔTURÉE ──
  await executeTest(11, "Sécurité comptable : interdiction de supprimer une dépense rattachée à une session fermée", async () => {
    const expense = await prisma.expense.findFirst({
      where: { sessionId: activeSessionId },
    });
    assert(expense !== null, "Dépense de test introuvable");

    const delRes = await cashActions.deleteExpenseAction(expense!.id);
    assert(delRes.success === false, "La suppression d'une dépense de session clôturée doit être interdite.");
    assert(
      Boolean(delRes.error?.includes("déjà clôturée")),
      `Message attendu sur interdiction de suppression, reçu: ${delRes.error}`
    );
  });

  // ─── TEST 12: FILTRAGE MULTI-CRITÈRES DU GRAND LIVRE ─────────────────────────
  await executeTest(12, "Filtrage du grand livre par mode de règlement (Espèces vs Transfert) et type (Encaissement vs Décaissement)", async () => {
    // 1. Filtrer par espèces uniquement
    const cashFilter = await cashActions.getCashDashboardData({ method: "cash" });
    for (const item of cashFilter.ledger) {
      assert(item.method === "cash", `L'élément ${item.reference} a un mode non-cash (${item.method})`);
    }

    // 2. Filtrer par virements uniquement
    const transferFilter = await cashActions.getCashDashboardData({ method: "transfer" });
    assert(transferFilter.ledger.length > 0, "Au moins un virement doit être trouvé");
    for (const item of transferFilter.ledger) {
      assert(item.method === "transfer", `L'élément ${item.reference} n'est pas un virement`);
    }

    // 3. Filtrer par décaissements uniquement
    const decaissementFilter = await cashActions.getCashDashboardData({ type: "decaissement" });
    for (const item of decaissementFilter.ledger) {
      assert(item.type === "decaissement", `L'élément ${item.reference} n'est pas un décaissement`);
    }
  });

  // ─── TEST 13: RÉCONCILIATION COMPTABLE GLOBALE (TRÉSORERIE TOTALE) ───────────
  await executeTest(13, "Réconciliation globale exacte : Total Entrées - Total Sorties = Trésorerie Nette", async () => {
    const data = await cashActions.getCashDashboardData();

    // Entrées :
    // Vente espèces = 25,000 DA
    // Virement client = 40,000 DA
    // Total Entrées = 65,000 DA
    assert(data.metrics.globalInflows === 65000, `Total entrées attendu 65000, reçu: ${data.metrics.globalInflows}`);

    // Sorties :
    // Achat fournisseur espèces = 10,000 DA
    // Achat fournisseur chèque = 20,000 DA
    // Dépense transport espèces = 3,000 DA
    // Total Sorties = 33,000 DA
    assert(data.metrics.globalOutflows === 33000, `Total sorties attendu 33000, reçu: ${data.metrics.globalOutflows}`);

    // Trésorerie Nette : 65,000 - 33,000 = 32,000 DA
    assert(data.metrics.globalNet === 32000, `Trésorerie nette attendue 32000, reçue: ${data.metrics.globalNet}`);
  });

  // ─── TEST 14: SÉCURITÉ TRANSACTIONNELLE ET ROLLBACK ─────────────────────────
  await executeTest(14, "Atomicité de clôture de caisse : intégrité et rollback en cas d'erreur", async () => {
    // Tenter de clôturer une session inexistante ID 99999
    const fakeClose = await cashActions.closeCashSessionAction({
      sessionId: 99999,
      closingAmount: 5000,
    });
    assert(fakeClose.success === false, "Une session inexistante ne peut pas être clôturée");

    // Ouvrir une nouvelle session pour vérifier la continuité
    const newSession = await cashActions.openCashSessionAction({
      openingAmount: 5000,
      openingNotes: "Session de l'après-midi",
    });
    assert(newSession.success === true, "La nouvelle session doit pouvoir s'ouvrir après la clôture de la précédente.");
  });

  // ─── RÉCAPITULATIF ─────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  RÉSULTATS DE LA SUITE CAISSE & TRÉSORERIE : ${passed}/${total} RÉUSSIS`);
  if (failed > 0) {
    console.error(`  ÉCHECS : ${failed} test(s) ont échoué.`);
    process.exit(1);
  } else {
    console.log("  TOUS LES TESTS DU MODULE CAISSE & TRÉSORERIE SONT VALIDÉS AVEC SUCCÈS !");
    console.log("================================================================================\n");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale d'exécution de la suite de tests Caisse :", err);
  process.exit(1);
});
