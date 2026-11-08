/**
 * Integration Test Suite: Treasury Unification & Reconciliation Integrity
 *
 * Verifies the 14 mandatory scenarios:
 *  1. Transactions linked to active session.
 *  2. Transactions without session ID (sessionId = null).
 *  3. Transactions performed between sessions.
 *  4. Multiple sessions on one day.
 *  5. Transactions linked to previous closed sessions.
 *  6. Deposits and withdrawals (adjustments/income/expense).
 *  7. Customer payments.
 *  8. Supplier payments and additional payments.
 *  9. Expenses.
 * 10. Internal transfers between Caisse, Coffre, and Bank.
 * 11. Midnight / timezone variations.
 * 12. Account balance (calculateAccountBalance) vs daily journal (getDailyCashJournal) reconciliation.
 * 13. Active session (getCashDashboardData) vs account balance reconciliation.
 * 14. Anti-double counting verification upon session reconciliation.
 *
 * Isolated SQLite database: prisma/test_treasury_unification.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_treasury_unification.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore
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
  console.log("  SHOP ERP — SUITE DE TESTS : UNIFICATION ET RÉCONCILIATION DE TRÉSORERIE");
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

  const { prisma } = await import("@/lib/prisma");
  const {
    calculateAccountBalance,
    getAccountMovements,
  } = await import("@/app/cash/treasury-actions");
  const {
    getDailyCashJournal,
    getCashDashboardData,
    openCashSessionAction,
    reconcileOutOfSessionCashAction,
    closeCashSessionAction,
  } = await import("@/app/cash/actions");

  // Comptes de trésorerie
  let caisse = await prisma.treasuryAccount.findFirst({
    where: { isDefault: true, isActive: true },
  });
  if (!caisse) {
    caisse = await prisma.treasuryAccount.create({
      data: {
        code: "ACC-CAISSE",
        name: "Caisse journalière",
        type: "cash",
        isDefault: true,
        openingBalance: 0,
      },
    });
  } else {
    await prisma.treasuryAccount.update({
      where: { id: caisse.id },
      data: { openingBalance: 0 },
    });
  }

  let coffre = await prisma.treasuryAccount.findFirst({
    where: { type: "safe", isActive: true },
  });
  if (!coffre) {
    coffre = await prisma.treasuryAccount.create({
      data: {
        code: "ACC-COFFRE-MAGASIN",
        name: "Coffre magasin",
        type: "safe",
        isDefault: false,
        openingBalance: 500000,
      },
    });
  } else {
    await prisma.treasuryAccount.update({
      where: { id: coffre.id },
      data: { openingBalance: 500000 },
    });
  }

  let banque = await prisma.treasuryAccount.findFirst({
    where: { type: "bank", isActive: true },
  });
  if (!banque) {
    banque = await prisma.treasuryAccount.create({
      data: {
        code: "ACC-BANQUE",
        name: "Compte Bancaire",
        type: "bank",
        isDefault: false,
        openingBalance: 1000000,
      },
    });
  } else {
    await prisma.treasuryAccount.update({
      where: { id: banque.id },
      data: { openingBalance: 1000000 },
    });
  }

  const customer = await prisma.customer.create({
    data: { name: "Client Test Unification", phone: "0555001122" },
  });

  const supplier = await prisma.supplier.create({
    data: { name: "Fournisseur Test Unification", phone: "0555334455" },
  });

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  // SCÉNARIO 2: Transactions créées sans session active (sessionId = null)
  console.log("--- SCÉNARIO 2: Transactions sans session active (sessionId = null) ---");
  try {
    // 3 encaissements ventes hors session
    await prisma.payment.create({
      data: {
        reference: "PAY-OUT-001",
        amount: 4000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: null,
        paymentDate: new Date(),
      },
    });
    await prisma.payment.create({
      data: {
        reference: "PAY-OUT-002",
        amount: 95000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: null,
        paymentDate: new Date(),
      },
    });
    await prisma.payment.create({
      data: {
        reference: "PAY-OUT-003",
        amount: 25500,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: null,
        paymentDate: new Date(),
      },
    });

    // 2 dépenses hors session
    await prisma.expense.create({
      data: {
        reference: "EXP-OUT-001",
        amount: 500,
        method: "cash",
        type: "expense",
        category: "Fournitures",
        description: "Papeterie hors session",
        accountId: caisse.id,
        sessionId: null,
        date: new Date(),
      },
    });
    await prisma.expense.create({
      data: {
        reference: "EXP-OUT-002",
        amount: 4000,
        method: "cash",
        type: "expense",
        category: "Transport",
        description: "Course hors session",
        accountId: caisse.id,
        sessionId: null,
        date: new Date(),
      },
    });

    const balOutOfSession = await calculateAccountBalance(caisse.id);
    assert(
      balOutOfSession === 120000,
      `Attendu solde caisse = 120,000 DA, reçu: ${balOutOfSession} DA`
    );

    const journalOutOfSession = await getDailyCashJournal(todayStr);
    assert(
      journalOutOfSession.theoreticalFinalBalance === 120000,
      `Attendu journal final = 120,000 DA, reçu: ${journalOutOfSession.theoreticalFinalBalance} DA`
    );
    assert(
      journalOutOfSession.totalInflows === 124500,
      `Attendu entrées = 124,500 DA, reçu: ${journalOutOfSession.totalInflows}`
    );
    assert(
      journalOutOfSession.totalOutflows === 4500,
      `Attendu sorties = 4,500 DA, reçu: ${journalOutOfSession.totalOutflows}`
    );

    results.push({
      num: 2,
      name: "Transactions sans session (sessionId = null) intégrées avec exactitude (120,000 DA)",
      passed: true,
    });
    console.log("✓ Scénario 2 réussi.");
  } catch (err: any) {
    results.push({ num: 2, name: "Transactions sans session", passed: false, error: err.message });
    console.error("✗ Scénario 2 échoué:", err.message);
  }

  // SCÉNARIO 3: Transactions créées entre sessions & ouverture avec openingAmount = 0
  console.log("\n--- SCÉNARIO 3: Ouverture de session sans rattachement immédiat ---");
  let activeSessionId: number | null = null;
  try {
    const openRes = await openCashSessionAction({
      openingAmount: 0,
      openingNotes: "Session après-midi ouverte sans rattachement initial",
      includePendingCash: false,
    });
    assert(openRes.success, `Ouverture session échouée: ${openRes.error}`);
    assert(openRes.data !== undefined, "Session non retournée dans openRes.data");
    activeSessionId = (openRes.data as any).id;

    // Vérifier que le solde de compte physique de Caisse reste 120,000 DA (l'argent est physiquement dans le tiroir !)
    const balWithOpenSession = await calculateAccountBalance(caisse.id);
    assert(
      balWithOpenSession === 120000,
      `Solde caisse doit être 120,000 DA (physique), obtenu: ${balWithOpenSession} DA`
    );

    // Vérifier les données du dashboard de clôture
    const dashData = await getCashDashboardData();
    assert(dashData.activeSession !== null, "activeSession doit être non null");
    assert(
      dashData.activeSession!.openingAmount === 0,
      `openingAmount attendu 0, obtenu: ${dashData.activeSession!.openingAmount}`
    );
    assert(
      dashData.activeSession!.currentTheoreticalCash === 0,
      `Solde théorique session attendu 0, obtenu: ${dashData.activeSession!.currentTheoreticalCash}`
    );
    assert(
      dashData.outOfSessionCash.pendingNet === 120000,
      `pendingNet attendu 120,000 DA, obtenu: ${dashData.outOfSessionCash.pendingNet}`
    );
    assert(
      dashData.outOfSessionCash.itemsCount === 5,
      `itemsCount attendu 5, obtenu: ${dashData.outOfSessionCash.itemsCount}`
    );

    results.push({
      num: 3,
      name: "Ouverture sans rattachement préserve le solde physique (120,000 DA) et alerte le caissier",
      passed: true,
    });
    console.log("✓ Scénario 3 réussi.");
  } catch (err: any) {
    results.push({ num: 3, name: "Ouverture sans rattachement", passed: false, error: err.message });
    console.error("✗ Scénario 3 échoué:", err.message);
  }

  // SCÉNARIO 1: Transactions créées pendant une session active (liées à la session)
  console.log("\n--- SCÉNARIO 1: Transactions créées pendant une session active ---");
  try {
    assert(activeSessionId !== null, "Pas de session active");
    await prisma.payment.create({
      data: {
        reference: "PAY-IN-SESSION-001",
        amount: 30000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: activeSessionId,
        paymentDate: new Date(),
      },
    });

    await prisma.expense.create({
      data: {
        reference: "EXP-IN-SESSION-001",
        amount: 2000,
        method: "cash",
        type: "expense",
        category: "Entretien",
        description: "Nettoyage en session",
        accountId: caisse.id,
        sessionId: activeSessionId,
        date: new Date(),
      },
    });

    // Solde de caisse total attendu : 120,000 + 30,000 - 2,000 = 148,000 DA
    const balTotal = await calculateAccountBalance(caisse.id);
    assert(balTotal === 148000, `Solde caisse attendu 148,000 DA, obtenu: ${balTotal}`);

    // Dashboard session : solde théorique de session seule = 0 + 30,000 - 2,000 = 28,000 DA
    const dashAfterOps = await getCashDashboardData();
    assert(
      dashAfterOps.activeSession!.currentTheoreticalCash === 28000,
      `Solde théorique session attendu 28,000 DA, obtenu: ${dashAfterOps.activeSession!.currentTheoreticalCash}`
    );
    // Pending out of session cash toujours 120,000 DA
    assert(
      dashAfterOps.outOfSessionCash.pendingNet === 120000,
      `pendingNet toujours 120,000 DA, obtenu: ${dashAfterOps.outOfSessionCash.pendingNet}`
    );

    results.push({
      num: 1,
      name: "Transactions en cours de session s'intègrent sans interférence avec le hors-session",
      passed: true,
    });
    console.log("✓ Scénario 1 réussi.");
  } catch (err: any) {
    results.push({ num: 1, name: "Transactions en session", passed: false, error: err.message });
    console.error("✗ Scénario 1 échoué:", err.message);
  }

  // SCÉNARIO 13: Réconciliation active session vs solde compte
  console.log("\n--- SCÉNARIO 13: Réconciliation Session Théorique vs Solde Compte Caisse ---");
  try {
    const dash = await getCashDashboardData();
    const caisseBal = await calculateAccountBalance(caisse.id);
    const sumTheoreticalAndPending =
      dash.activeSession!.currentTheoreticalCash + dash.outOfSessionCash.pendingNet;

    assert(
      caisseBal === sumTheoreticalAndPending,
      `Formule de trésorerie violée: Solde Caisse (${caisseBal}) !== Session (${dash.activeSession!.currentTheoreticalCash}) + Hors-Session (${dash.outOfSessionCash.pendingNet})`
    );

    results.push({
      num: 13,
      name: "Égalité parfaite: Solde Caisse = Session Théorique + Hors-Session en attente",
      passed: true,
    });
    console.log("✓ Scénario 13 réussi: 148,000 DA = 28,000 DA (session) + 120,000 DA (hors-session).");
  } catch (err: any) {
    results.push({ num: 13, name: "Réconciliation session vs compte", passed: false, error: err.message });
    console.error("✗ Scénario 13 échoué:", err.message);
  }

  // SCÉNARIO 14: Rattachement (reconciliation) et anti-double comptage
  console.log("\n--- SCÉNARIO 14: Rattachement en cours de session et vérification anti-double comptage ---");
  try {
    const recRes = await reconcileOutOfSessionCashAction(activeSessionId!);
    assert(recRes.success, `Réconciliation échouée: ${recRes.error}`);

    // Après rattachement :
    // 1. pendingNet doit être 0 DA
    const dashAfterRec = await getCashDashboardData();
    assert(
      dashAfterRec.outOfSessionCash.pendingNet === 0,
      `pendingNet doit être 0 après rattachement, obtenu: ${dashAfterRec.outOfSessionCash.pendingNet}`
    );
    assert(
      dashAfterRec.outOfSessionCash.itemsCount === 0,
      `itemsCount doit être 0 après rattachement, obtenu: ${dashAfterRec.outOfSessionCash.itemsCount}`
    );

    // 2. Le solde théorique de la session doit avoir absorbé les 120,000 DA : 28,000 + 120,000 = 148,000 DA
    assert(
      dashAfterRec.activeSession!.currentTheoreticalCash === 148000,
      `Solde théorique session doit être 148,000 DA, obtenu: ${dashAfterRec.activeSession!.currentTheoreticalCash}`
    );

    // 3. Le solde de compte caisse doit rester exactement 148,000 DA (AUCUN DOUBLE COMPTAGE)
    const caisseBalAfterRec = await calculateAccountBalance(caisse.id);
    assert(
      caisseBalAfterRec === 148000,
      `Solde caisse a été double-compté ! Attendu 148,000 DA, obtenu: ${caisseBalAfterRec}`
    );

    // 4. Le journal journalier doit rester exactement 148,000 DA (AUCUN DOUBLE COMPTAGE)
    const journalAfterRec = await getDailyCashJournal(todayStr);
    assert(
      journalAfterRec.theoreticalFinalBalance === 148000,
      `Journal a été altéré ! Attendu 148,000 DA, obtenu: ${journalAfterRec.theoreticalFinalBalance}`
    );

    results.push({
      num: 14,
      name: "Rattachement réussi avec conservation stricte des soldes et zéro double comptage",
      passed: true,
    });
    console.log("✓ Scénario 14 réussi.");
  } catch (err: any) {
    results.push({ num: 14, name: "Rattachement et anti-double comptage", passed: false, error: err.message });
    console.error("✗ Scénario 14 échoué:", err.message);
  }

  // SCÉNARIO 6: Dépôts et Retraits (Ajustements de trésorerie / Apports)
  console.log("\n--- SCÉNARIO 6: Ajustements positifs et négatifs ---");
  try {
    // Dépôt d'espèces (+5,000 DA, type income)
    await prisma.expense.create({
      data: {
        reference: "AJT-TEST-IN-001",
        amount: 5000,
        type: "income",
        method: "cash",
        category: "apport",
        description: "Apport monnaie test",
        accountId: caisse.id,
        sessionId: activeSessionId,
        date: new Date(),
      },
    });

    // Retrait d'espèces (-3,000 DA, type expense)
    await prisma.expense.create({
      data: {
        reference: "AJT-TEST-OUT-001",
        amount: 3000,
        type: "expense",
        method: "cash",
        category: "retrait",
        description: "Retrait test",
        accountId: caisse.id,
        sessionId: activeSessionId,
        date: new Date(),
      },
    });

    // Solde attendu : 148,000 + 5,000 - 3,000 = 150,000 DA
    const balWithAdj = await calculateAccountBalance(caisse.id);
    assert(
      balWithAdj === 150000,
      `Solde caisse après ajustements attendu 150,000 DA, obtenu: ${balWithAdj}`
    );

    const journalWithAdj = await getDailyCashJournal(todayStr);
    assert(
      journalWithAdj.theoreticalFinalBalance === 150000,
      `Journal après ajustements attendu 150,000 DA, obtenu: ${journalWithAdj.theoreticalFinalBalance}`
    );

    results.push({
      num: 6,
      name: "Ajustements de trésorerie (positifs et négatifs) impactent la caisse avec exactitude",
      passed: true,
    });
    console.log("✓ Scénario 6 réussi.");
  } catch (err: any) {
    results.push({ num: 6, name: "Ajustements de trésorerie", passed: false, error: err.message });
    console.error("✗ Scénario 6 échoué:", err.message);
  }

  // SCÉNARIO 7: Paiement client (Vente au comptant)
  console.log("\n--- SCÉNARIO 7: Paiement client ---");
  try {
    await prisma.payment.create({
      data: {
        reference: "PAY-CUST-001",
        amount: 10000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: activeSessionId,
        paymentDate: new Date(),
      },
    });

    const balAfterCust = await calculateAccountBalance(caisse.id);
    assert(balAfterCust === 160000, `Solde attendu 160,000 DA, obtenu: ${balAfterCust}`);

    results.push({
      num: 7,
      name: "Paiements clients au comptant incrémentent la caisse",
      passed: true,
    });
    console.log("✓ Scénario 7 réussi.");
  } catch (err: any) {
    results.push({ num: 7, name: "Paiement client", passed: false, error: err.message });
    console.error("✗ Scénario 7 échoué:", err.message);
  }

  // SCÉNARIO 8: Paiements fournisseurs et versements supplémentaires
  console.log("\n--- SCÉNARIO 8: Paiements et versements fournisseurs ---");
  try {
    // 1. Paiement fournisseur dette classique : -15,000 DA
    await prisma.payment.create({
      data: {
        reference: "SPAY-TEST-001",
        supplierId: supplier.id,
        amount: 15000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: activeSessionId,
        paymentDate: new Date(),
      },
    });

    // 2. Versement supplémentaire fournisseur (non-dette) : -5,000 DA
    await prisma.supplierAdditionalPayment.create({
      data: {
        reference: "SAP-TEST-001",
        supplierId: supplier.id,
        amount: 5000,
        paymentMethod: "cash",
        treasuryAccountId: caisse.id,
        sessionId: activeSessionId,
        date: new Date(),
      },
    });

    // Solde attendu : 160,000 - 15,000 - 5,000 = 140,000 DA
    const balAfterSupp = await calculateAccountBalance(caisse.id);
    assert(
      balAfterSupp === 140000,
      `Solde attendu 140,000 DA après paiements fournisseurs, obtenu: ${balAfterSupp}`
    );

    const journalAfterSupp = await getDailyCashJournal(todayStr);
    assert(
      journalAfterSupp.theoreticalFinalBalance === 140000,
      `Journal attendu 140,000 DA après fournisseurs, obtenu: ${journalAfterSupp.theoreticalFinalBalance}`
    );

    results.push({
      num: 8,
      name: "Paiements dette fournisseur et versements supplémentaires déduits sans ambiguïté",
      passed: true,
    });
    console.log("✓ Scénario 8 réussi.");
  } catch (err: any) {
    results.push({ num: 8, name: "Paiements fournisseurs", passed: false, error: err.message });
    console.error("✗ Scénario 8 échoué:", err.message);
  }

  // SCÉNARIO 9: Dépenses (Charges)
  console.log("\n--- SCÉNARIO 9: Dépenses d'exploitation ---");
  try {
    await prisma.expense.create({
      data: {
        reference: "EXP-OPER-001",
        amount: 10000,
        method: "cash",
        type: "expense",
        category: "Électricité",
        description: "Facture électricité",
        accountId: caisse.id,
        sessionId: activeSessionId,
        date: new Date(),
      },
    });

    // Solde attendu : 140,000 - 10,000 = 130,000 DA
    const balAfterExp = await calculateAccountBalance(caisse.id);
    assert(balAfterExp === 130000, `Solde attendu 130,000 DA, obtenu: ${balAfterExp}`);

    results.push({
      num: 9,
      name: "Dépenses d'exploitation correctement déduites du solde de caisse",
      passed: true,
    });
    console.log("✓ Scénario 9 réussi.");
  } catch (err: any) {
    results.push({ num: 9, name: "Dépenses d'exploitation", passed: false, error: err.message });
    console.error("✗ Scénario 9 échoué:", err.message);
  }

  // SCÉNARIO 10: Transferts internes (Caisse -> Coffre, Coffre -> Banque)
  console.log("\n--- SCÉNARIO 10: Transferts internes de trésorerie ---");
  try {
    const coffreBefore = await calculateAccountBalance(coffre.id);
    assert(coffreBefore === 500000, `Coffre initial attendu 500,000, obtenu: ${coffreBefore}`);

    // Transfert 100,000 DA de Caisse vers Coffre magasin
    await prisma.treasuryTransfer.create({
      data: {
        reference: "TRF-TEST-001",
        fromAccountId: caisse.id,
        toAccountId: coffre.id,
        amount: 100000,
        date: new Date(),
        motif: "Versement recettes caisse vers coffre",
        sessionId: activeSessionId,
      },
    });

    // Caisse passe de 130,000 à 30,000 DA
    const caisseAfterTrf = await calculateAccountBalance(caisse.id);
    assert(
      caisseAfterTrf === 30000,
      `Caisse après transfert attendue 30,000 DA, obtenue: ${caisseAfterTrf}`
    );

    // Coffre passe de 500,000 à 600,000 DA
    const coffreAfterTrf = await calculateAccountBalance(coffre.id);
    assert(
      coffreAfterTrf === 600000,
      `Coffre après transfert attendu 600,000 DA, obtenu: ${coffreAfterTrf}`
    );

    // Richesse globale de la boutique conservée
    const totalGlobal = caisseAfterTrf + coffreAfterTrf;
    assert(
      totalGlobal === 630000,
      `Somme globale Caisse + Coffre attendue 630,000 DA, obtenue: ${totalGlobal}`
    );

    // Journal journalier de Caisse doit refléter le transfert et afficher 30,000 DA
    const journalAfterTrf = await getDailyCashJournal(todayStr);
    assert(
      journalAfterTrf.theoreticalFinalBalance === 30000,
      `Journal Caisse attendu 30,000 DA, obtenu: ${journalAfterTrf.theoreticalFinalBalance}`
    );
    assert(
      journalAfterTrf.transfersOut === 100000,
      `Transferts sortants dans journal attendus 100,000 DA, obtenus: ${journalAfterTrf.transfersOut}`
    );

    results.push({
      num: 10,
      name: "Transferts internes Caisse -> Coffre conservent la masse financière et déduisent la caisse",
      passed: true,
    });
    console.log("✓ Scénario 10 réussi.");
  } catch (err: any) {
    results.push({ num: 10, name: "Transferts internes", passed: false, error: err.message });
    console.error("✗ Scénario 10 échoué:", err.message);
  }

  // SCÉNARIO 4 & 5: Clôture de Session 1 et Ouverture de Session 2 le même jour
  console.log("\n--- SCÉNARIO 4 & 5: Clôture Session 1 et Ouverture Session 2 sur la même journée ---");
  try {
    // Clôture de la Session 1
    // Solde théorique = 30,000 DA
    // On conserve un fond de roulement de 10,000 DA dans la caisse, et on transfère 20,000 DA au coffre
    const closeRes = await closeCashSessionAction({
      sessionId: activeSessionId!,
      closingAmount: 30000,
      transferAmount: 20000,
      transferDestinationAccountId: coffre.id,
      closingNotes: "Clôture Session 1 après-midi",
    });
    assert(closeRes.success, `Clôture Session 1 échouée: ${closeRes.error}`);

    // Après clôture :
    // Caisse doit avoir exactement retainedAmount = 10,000 DA
    const caisseAfterClose = await calculateAccountBalance(caisse.id);
    assert(
      caisseAfterClose === 10000,
      `Caisse après clôture attendue 10,000 DA, obtenue: ${caisseAfterClose}`
    );

    // Coffre magasin reçoit les 20,000 DA : 600,000 + 20,000 = 620,000 DA
    const coffreAfterClose = await calculateAccountBalance(coffre.id);
    assert(
      coffreAfterClose === 620000,
      `Coffre après clôture attendu 620,000 DA, obtenu: ${coffreAfterClose}`
    );

    // Entre les 2 sessions, une vente au comptant arrive : +15,000 DA (sessionId = null)
    await prisma.payment.create({
      data: {
        reference: "PAY-BETWEEN-SESSIONS-001",
        amount: 15000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: null,
        paymentDate: new Date(),
      },
    });

    // Solde physique de caisse : 10,000 (fond) + 15,000 (nouvelle vente) = 25,000 DA
    const caisseInterSession = await calculateAccountBalance(caisse.id);
    assert(
      caisseInterSession === 25000,
      `Solde Caisse inter-session attendu 25,000 DA, obtenu: ${caisseInterSession}`
    );

    // Ouverture de la Session 2 (du soir) avec fond de 10,000 DA et intégration automatique du pending cash
    const openS2Res = await openCashSessionAction({
      openingAmount: 10000,
      openingNotes: "Session 2 du soir",
      includePendingCash: true,
    });
    assert(openS2Res.success, `Ouverture Session 2 échouée: ${openS2Res.error}`);
    const s2Id = (openS2Res.data as any).id;

    // La vente inter-session de 15,000 DA a été rattachée à la Session 2
    const dashS2 = await getCashDashboardData();
    assert(dashS2.activeSession!.id === s2Id, "Session 2 doit être active");
    assert(
      dashS2.activeSession!.openingAmount === 10000,
      `Opening amount Session 2 attendu 10,000, obtenu: ${dashS2.activeSession!.openingAmount}`
    );
    assert(
      dashS2.activeSession!.currentTheoreticalCash === 25000,
      `Solde théorique Session 2 attendu 25,000 DA, obtenu: ${dashS2.activeSession!.currentTheoreticalCash}`
    );
    assert(
      dashS2.outOfSessionCash.pendingNet === 0,
      `Pending cash Session 2 attendu 0, obtenu: ${dashS2.outOfSessionCash.pendingNet}`
    );

    // Solde de compte Caisse : 25,000 DA (aucun double comptage des sessions précédentes)
    const caisseS2Bal = await calculateAccountBalance(caisse.id);
    assert(
      caisseS2Bal === 25000,
      `Solde Caisse sous Session 2 attendu 25,000 DA, obtenu: ${caisseS2Bal}`
    );

    // Mettre à jour activeSessionId pour la suite des tests
    activeSessionId = s2Id;

    results.push({
      num: 4,
      name: "Sessions multiples dans la même journée gérées sans interférence",
      passed: true,
    });
    results.push({
      num: 5,
      name: "Transactions de sessions antérieures closes isolées du solde session courante",
      passed: true,
    });
    console.log("✓ Scénarios 4 et 5 réussis.");
  } catch (err: any) {
    results.push({ num: 4, name: "Sessions multiples", passed: false, error: err.message });
    results.push({ num: 5, name: "Transactions sessions antérieures", passed: false, error: err.message });
    console.error("✗ Scénario 4/5 échoué:", err.message);
  }

  // SCÉNARIO 11: Variations minuit / fuseau horaire
  console.log("\n--- SCÉNARIO 11: Variations minuit / fuseaux horaires ---");
  try {
    // Opération enregistrée en fin de journée (23:30 heure locale)
    const lateNightDate = new Date();
    lateNightDate.setHours(23, 30, 0, 0);

    await prisma.payment.create({
      data: {
        reference: "PAY-LATE-NIGHT-001",
        amount: 2500,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: activeSessionId,
        paymentDate: lateNightDate,
      },
    });

    // Vérifier inclusion dans le solde de caisse
    const balWithLate = await calculateAccountBalance(caisse.id);
    assert(
      balWithLate === 27500,
      `Solde avec paiement fin de journée attendu 27,500 DA, obtenu: ${balWithLate}`
    );

    results.push({
      num: 11,
      name: "Paiements proches de minuit (UTC/local) capturés et réconciliés sans perte",
      passed: true,
    });
    console.log("✓ Scénario 11 réussi.");
  } catch (err: any) {
    results.push({ num: 11, name: "Variations minuit / timezone", passed: false, error: err.message });
    console.error("✗ Scénario 11 échoué:", err.message);
  }

  // SCÉNARIO 12: Réconciliation Solde de compte vs Journal Journalier
  console.log("\n--- SCÉNARIO 12: Réconciliation globale Solde Compte Caisse vs Journal Journalier ---");
  try {
    const finalCaisseBal = await calculateAccountBalance(caisse.id);
    const finalJournal = await getDailyCashJournal(todayStr);

    console.log(`  - Solde Compte Caisse (calculateAccountBalance) : ${finalCaisseBal} DA`);
    console.log(`  - Solde Final Journal (getDailyCashJournal)      : ${finalJournal.theoreticalFinalBalance} DA`);

    assert(
      finalCaisseBal === finalJournal.theoreticalFinalBalance,
      `Divergence détectée ! Caisse: ${finalCaisseBal} DA !== Journal: ${finalJournal.theoreticalFinalBalance} DA`
    );

    results.push({
      num: 12,
      name: "Cohérence mathématique absolue : Solde Compte Caisse === Solde Final Journal Journalier",
      passed: true,
    });
    console.log("✓ Scénario 12 réussi.");
  } catch (err: any) {
    results.push({ num: 12, name: "Réconciliation Solde Compte vs Journal", passed: false, error: err.message });
    console.error("✗ Scénario 12 échoué:", err.message);
  }

  // Affichage du récapitulatif
  console.log("\n================================================================================");
  console.log("  RÉCAPITULATIF DES 14 SCÉNARIOS DE TEST");
  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  for (const r of results.sort((a, b) => a.num - b.num)) {
    console.log(`  ${r.passed ? "✓ PASS" : "✗ FAIL"} [Scénario ${r.num.toString().padStart(2, "0")}] ${r.name}`);
    if (r.error) console.log(`         Erreur: ${r.error}`);
  }
  console.log("================================================================================");
  console.log(`  Total: ${passedCount}/${results.length} scénarios réussis.`);
  console.log("================================================================================\n");

  if (passedCount < results.length) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale exécution suite de tests:", err);
  process.exit(1);
});
