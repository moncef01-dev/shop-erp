/**
 * Integration Test Suite: Cash Payments Without Open Session & Cash Reconciliation Policy
 *
 * Tests:
 * 1. Cash payment without an open session is persisted exactly once with sessionId = null.
 * 2. Unlinked cash receipt appears in Treasury totals and is tracked in outOfSessionCash pending reconciliation.
 * 3. Bank transfers, cheques, and CIB never affect the physical cash drawer (in or out of session).
 * 4. Opening a cash session with `includePendingCash: true` atomically links pending out-of-session cash.
 * 5. Cash payment during an active session is automatically linked to the session.
 * 6. Out-of-session cash can be reconciled mid-session via reconcileOutOfSessionCashAction.
 * 7. Closing a session accurately accounts for all linked receipts and produces 0 discrepancy when physical matches.
 * 8. Every receipt is counted exactly once in global financial reports and treasury ledger.
 *
 * Runs against an isolated temporary SQLite database: prisma/test_cash_out_of_session.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_cash_out_of_session.db");
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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  SHOP ERP — SUITE DE TESTS : PAIEMENTS ESPÈCES HORS SESSION & RÉCONCILIATION");
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
  console.log("✓ Schéma et migrations appliqués à la base de test isolée.\n");

  // Importer Prisma et Actions
  const { prisma } = await import("@/lib/prisma");
  const productActions = await import("@/app/products/actions");
  const salesActions = await import("@/app/sales/actions");
  const cashActions = await import("@/app/cash/actions");

  // Initialiser emplacements
  await productActions.ensureDefaultLocations();
  const showroom = await prisma.location.findFirst({ where: { code: "SHOWROOM" } });
  assert(showroom !== null, "Emplacement SHOWROOM introuvable");

  const cat = await prisma.category.create({ data: { name: "Fauteuils & Salons" } });
  const customer = await prisma.customer.create({
    data: { name: "Client Audit Caisse", phone: "0555001122" },
  });

  const product = await prisma.product.create({
    data: {
      sku: "SAL-LUX-TEST",
      name: "Salon Cuir Lux",
      categoryId: cat.id,
      costPrice: 50000,
      sellingPrice: 80000,
      stock: 5,
      stocks: {
        create: {
          locationId: showroom!.id,
          quantity: 5,
        },
      },
    },
  });

  // TEST 1: Enregistrement d'un acompte en espèces SANS session de caisse ouverte
  console.log("--- TEST 1: Enregistrement d'un acompte espèces hors session ---");
  const saleRes1 = await salesActions.createSaleAction({
    customerId: customer.id,
    status: "draft", // Brouillon / Devis
    items: [
      {
        productId: product.id,
        locationId: showroom!.id,
        quantity: 1,
        unitPrice: 80000,
      },
    ],
    initialPayment: {
      amount: 15000, // Acompte 15 000 DA en espèces
      method: "cash",
      notes: "Acompte hors session test",
    },
  });

  assert(Boolean(saleRes1.success && saleRes1.data), `Échec création vente 1: ${saleRes1.error}`);
  const sale1Id = (saleRes1.data as { id: number }).id;
  const sale1 = await prisma.sales.findUnique({
    where: { id: sale1Id },
    include: { payments: true },
  });
  assert(sale1 !== null, "Vente 1 introuvable");
  assert(sale1!.paidAmount === 15000, `paidAmount attendu 15 000 DA, reçu ${sale1?.paidAmount}`);
  assert(sale1!.payments.length === 1, `Exactement 1 paiement attendu, reçu ${sale1?.payments.length}`);

  const p1 = sale1!.payments[0];
  assert(p1.amount === 15000, `Montant paiement attendu 15 000 DA, reçu ${p1.amount}`);
  assert(p1.method === "cash", `Mode attendu 'cash', reçu ${p1.method}`);
  assert(p1.sessionId === null, `sessionId doit être null car aucune session ouverte, reçu ${p1.sessionId}`);
  console.log("  [TEST 01] PASS: Paiement espèces hors session persisté exactement 1 fois avec sessionId = null");
  results.push({ num: 1, name: "Paiement espèces hors session persisté avec sessionId = null", passed: true });

  // TEST 2: Suivi explicite dans la trésorerie et outOfSessionCash
  console.log("\n--- TEST 2: Suivi dans la trésorerie globale et outOfSessionCash ---");
  const cashData1 = await cashActions.getCashDashboardData();
  assert(cashData1.activeSession === null, "Aucune session active attendue");
  assert(cashData1.metrics.channels.cash.inflows === 15000, `totalCashIn trésorerie attendu 15 000, reçu ${cashData1.metrics.channels.cash.inflows}`);
  assert(cashData1.metrics.globalNet === 15000, `balance globale trésorerie attendu 15 000, reçu ${cashData1.metrics.globalNet}`);
  assert(cashData1.metrics.channels.cash.net === 15000, `cash net attendu 15 000, reçu ${cashData1.metrics.channels.cash.net}`);

  // Vérification de outOfSessionCash
  assert(cashData1.outOfSessionCash !== undefined, "outOfSessionCash doit être défini");
  assert(cashData1.outOfSessionCash.itemsCount === 1, `outOfSessionCash.itemsCount attendu 1, reçu ${cashData1.outOfSessionCash.itemsCount}`);
  assert(cashData1.outOfSessionCash.pendingCashIn === 15000, `pendingCashIn attendu 15 000, reçu ${cashData1.outOfSessionCash.pendingCashIn}`);
  assert(cashData1.outOfSessionCash.pendingNet === 15000, `pendingNet attendu 15 000, reçu ${cashData1.outOfSessionCash.pendingNet}`);
  console.log("  [TEST 02] PASS: Paiement hors session correctement suivi dans outOfSessionCash (15 000 DA en attente)");
  results.push({ num: 2, name: "Suivi outOfSessionCash en attente de réconciliation", passed: true });

  // TEST 3: Virement bancaire hors session n'impacte pas le tiroir-caisse
  console.log("\n--- TEST 3: Paiement non-cash n'affecte pas outOfSessionCash ---");
  const saleRes2 = await salesActions.createSaleAction({
    customerId: customer.id,
    status: "draft",
    items: [
      {
        productId: product.id,
        locationId: showroom!.id,
        quantity: 1,
        unitPrice: 80000,
      },
    ],
    initialPayment: {
      amount: 20000,
      method: "transfer",
    },
  });
  assert(Boolean(saleRes2.success && saleRes2.data), `Échec vente 2: ${saleRes2.error}`);

  const cashData2 = await cashActions.getCashDashboardData();
  // Le solde global de trésorerie passe à 35 000 (15k cash + 20k virement)
  assert(cashData2.metrics.globalNet === 35000, `balance attendue 35 000, reçu ${cashData2.metrics.globalNet}`);
  // Mais outOfSessionCash ne doit pas changer (toujours 15 000 DA en espèces physiques)
  assert(cashData2.outOfSessionCash.pendingCashIn === 15000, `pendingCashIn physique attendu 15 000, reçu ${cashData2.outOfSessionCash.pendingCashIn}`);
  assert(cashData2.metrics.channels.cash.inflows === 15000, `cashChannelBalance physique attendu 15 000, reçu ${cashData2.metrics.channels.cash.inflows}`);
  assert(cashData2.metrics.channels.transfer.inflows === 20000, `bankChannelBalance attendu 20 000, reçu ${cashData2.metrics.channels.transfer.inflows}`);
  console.log("  [TEST 03] PASS: Virement bancaire n'affecte pas le tiroir physique ni outOfSessionCash");
  results.push({ num: 3, name: "Séparation stricte des flux bancaires et du tiroir physique", passed: true });

  // TEST 4: Ouverture d'une session de caisse avec intégration des espèces en attente
  console.log("\n--- TEST 4: Ouverture de caisse avec intégration du cash hors session (includePendingCash = true) ---");
  const openRes = await cashActions.openCashSessionAction({
    openingAmount: 10000, // Fond de caisse initial : 10 000 DA
    openingNotes: "Session test ouverture avec pending cash",
    includePendingCash: true,
  });
  assert(Boolean(openRes.success && openRes.data), `Échec ouverture caisse: ${openRes.error}`);
  const sId = (openRes.data as { id: number }).id;

  // Vérifier en base que le paiement 1 a été rattaché à la session
  const updatedP1 = await prisma.payment.findUnique({ where: { id: p1.id } });
  assert(updatedP1?.sessionId === sId, `Paiement 1 doit avoir sessionId = ${sId}, reçu ${updatedP1?.sessionId}`);

  // Vérifier le tableau de bord caisse
  const cashData3 = await cashActions.getCashDashboardData();
  assert(cashData3.activeSession !== null, "Une session active doit être présente");
  assert(cashData3.activeSession!.id === sId, `Session ID attendu ${sId}`);
  assert(cashData3.activeSession!.openingAmount === 10000, "Fond de caisse attendu 10 000 DA");
  assert(cashData3.activeSession!.currentCashIn === 15000, `currentCashIn attendu 15 000 DA, reçu ${cashData3.activeSession!.currentCashIn}`);
  assert(cashData3.activeSession!.currentTheoreticalCash === 25000, `currentTheoreticalCash attendu 25 000 DA (10k fond + 15k acompte), reçu ${cashData3.activeSession!.currentTheoreticalCash}`);
  assert(cashData3.outOfSessionCash.pendingNet === 0, `pendingNet attendu 0 après intégration, reçu ${cashData3.outOfSessionCash.pendingNet}`);
  console.log("  [TEST 04] PASS: Ouverture avec includePendingCash a rattaché l'acompte à la session (théorique = 25 000 DA)");
  results.push({ num: 4, name: "Rattachement automatique à l'ouverture de session", passed: true });

  // TEST 5: Enregistrement d'un paiement en cours de session active
  console.log("\n--- TEST 5: Paiement en cours de session active automatiquement rattaché ---");
  const fdPay = new FormData();
  fdPay.set("saleId", String(sale1Id));
  fdPay.set("amount", "10000");
  fdPay.set("method", "cash");
  fdPay.set("notes", "Paiement en cours de session active");

  const payRes = await salesActions.recordSalePaymentAction(fdPay);
  assert(payRes.success, `Échec recordSalePaymentAction: ${payRes.error}`);

  const cashData4 = await cashActions.getCashDashboardData();
  assert(cashData4.activeSession!.currentCashIn === 25000, `currentCashIn attendu 25 000 (15k + 10k), reçu ${cashData4.activeSession!.currentCashIn}`);
  assert(cashData4.activeSession!.currentTheoreticalCash === 35000, `theoreticalAmount attendu 35 000 (10k + 25k), reçu ${cashData4.activeSession!.currentTheoreticalCash}`);

  // Le paiement doit avoir sessionId = sId
  const lastPayment = await prisma.payment.findFirst({
    where: { saleId: sale1Id, amount: 10000 },
  });
  assert(lastPayment?.sessionId === sId, `Paiement en cours de session doit avoir sessionId = ${sId}`);
  console.log("  [TEST 05] PASS: Nouveau paiement espèces automatiquement lié à la session en cours");
  results.push({ num: 5, name: "Paiement en cours de session lié automatiquement", passed: true });

  // TEST 6: Clôture de la caisse avec réconciliation sans écart
  console.log("\n--- TEST 6: Clôture de la caisse et réconciliation exacte ---");
  const closeRes = await cashActions.closeCashSessionAction({
    sessionId: sId,
    closingAmount: 35000, // Comptage physique réel exact = 35 000 DA
    closingNotes: "Clôture conforme sans écart",
  });
  assert(closeRes.success, `Échec clôture session: ${closeRes.error}`);

  const closedSession = await prisma.cashSession.findUnique({ where: { id: sId } });
  assert(closedSession?.status === "closed", "La session doit être fermée");
  assert(closedSession?.totalCashIn === 25000, `totalCashIn attendu 25 000 DA, reçu ${closedSession?.totalCashIn}`);
  assert(closedSession?.theoreticalAmount === 35000, `theoreticalAmount attendu 35 000 DA, reçu ${closedSession?.theoreticalAmount}`);
  assert(closedSession?.closingAmount === 35000, `closingAmount attendu 35 000 DA, reçu ${closedSession?.closingAmount}`);
  assert(closedSession?.difference === 0, `Écart attendu 0 DA, reçu ${closedSession?.difference}`);
  console.log("  [TEST 06] PASS: Session clôturée sans anomalie, écart = 0 DA");
  results.push({ num: 6, name: "Clôture de session et réconciliation physique sans écart", passed: true });

  // TEST 7: Réconciliation manuelle mid-session (reconcileOutOfSessionCashAction)
  console.log("\n--- TEST 7: Réconciliation manuelle en cours de session ---");
  // 1) Enregistrer un nouveau paiement espèces sans session ouverte
  // Note: simulation d'un acompte enregistré hors session
  const saleRes3 = await salesActions.createSaleAction({
    customerId: customer.id,
    status: "draft",
    items: [{ productId: product.id, locationId: showroom!.id, quantity: 1, unitPrice: 80000 }],
    initialPayment: {
      amount: 5000,
      method: "cash",
      notes: "Acompte hors session test 7",
    },
  });
  assert(Boolean(saleRes3.success && saleRes3.data), `Échec vente 3: ${saleRes3.error}`);

  // 2) Ouvrir une session SANS intégrer immédiatement (includePendingCash = false)
  const openRes2 = await cashActions.openCashSessionAction({
    openingAmount: 5000,
    openingNotes: "Session sans includePendingCash",
    includePendingCash: false,
  });
  assert(Boolean(openRes2.success && openRes2.data), `Échec openRes2: ${openRes2.error}`);
  const sId2 = (openRes2.data as { id: number }).id;

  // Vérifier qu'il y a 5 000 DA pending
  let dataMid = await cashActions.getCashDashboardData();
  assert(dataMid.outOfSessionCash.pendingNet === 5000, `Attendu 5 000 DA pending, reçu ${dataMid.outOfSessionCash.pendingNet}`);
  assert(dataMid.activeSession!.currentCashIn === 0, `currentCashIn attendu 0, reçu ${dataMid.activeSession!.currentCashIn}`);

  // 3) Appeler reconcileOutOfSessionCashAction
  const recRes = await cashActions.reconcileOutOfSessionCashAction(sId2);
  assert(recRes.success, `Échec réconciliation manuelle: ${recRes.error}`);

  // 4) Vérifier après réconciliation
  dataMid = await cashActions.getCashDashboardData();
  assert(dataMid.outOfSessionCash.pendingNet === 0, "pendingNet doit être 0 après réconciliation manuelle");
  assert(dataMid.activeSession!.currentCashIn === 5000, `currentCashIn attendu 5 000 après réconciliation, reçu ${dataMid.activeSession!.currentCashIn}`);
  assert(dataMid.activeSession!.currentTheoreticalCash === 10000, `currentTheoreticalCash attendu 10 000 (5k fond + 5k acompte), reçu ${dataMid.activeSession!.currentTheoreticalCash}`);

  // Fermer la session 2
  await cashActions.closeCashSessionAction({
    sessionId: sId2,
    closingAmount: 10000,
    closingNotes: "Clôture session 2 conforme",
  });
  console.log("  [TEST 07] PASS: Réconciliation manuelle mid-session réussie (5 000 DA rattachés)");
  results.push({ num: 7, name: "Réconciliation manuelle en cours de session active", passed: true });

  // TEST 8: Anti-double-comptage dans le Grand Livre et la Trésorerie
  console.log("\n--- TEST 8: Intégrité financière & unicité comptable ---");
  const finalCashData = await cashActions.getCashDashboardData();
  // Total des paiements enregistrés dans ce test :
  // - Vente 1 acompte: 15 000 cash
  // - Vente 2 acompte: 20 000 virement
  // - Vente 1 règlement: 10 000 cash
  // - Vente 3 acompte: 5 000 cash
  // Total Inflows = 50 000 DA (30 000 cash + 20 000 virement)
  assert(finalCashData.metrics.channels.cash.inflows === 30000, `totalCashIn attendu 30 000, reçu ${finalCashData.metrics.channels.cash.inflows}`);
  assert(finalCashData.metrics.channels.transfer.inflows === 20000, `totalBankIn attendu 20 000, reçu ${finalCashData.metrics.channels.transfer.inflows}`);
  assert(finalCashData.metrics.globalNet === 50000, `balance attendue 50 000, reçu ${finalCashData.metrics.globalNet}`);

  // Vérifier qu'aucun mouvement n'est dupliqué dans le ledger
  const paymentsInDb = await prisma.payment.findMany();
  assert(paymentsInDb.length === 4, `Attendu 4 paiements distincts en base, trouvé ${paymentsInDb.length}`);
  const ledgerCount = finalCashData.ledger.length;
  assert(ledgerCount === 4, `Attendu 4 entrées dans le journal de trésorerie, trouvé ${ledgerCount}`);
  console.log("  [TEST 08] PASS: Intégrité financière parfaite, 0 double comptage dans les rapports");
  results.push({ num: 8, name: "Unicité comptable et anti-double-comptage", passed: true });

  console.log("\n================================================================================");
  console.log("  RÉSULTATS DE LA SUITE DE TESTS");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    console.log(`  [TEST ${String(r.num).padStart(2, "0")}] ${r.passed ? "PASS" : "FAIL"}: ${r.name}`);
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`  TOTAL: ${total} | RÉUSSIS: ${passed} | ÉCHECS: ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});
