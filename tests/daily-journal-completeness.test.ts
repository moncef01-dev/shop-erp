/**
 * Integration Test Suite: Daily Cash Journal Completeness & Integrity
 *
 * Scenarios tested:
 * 1. Transactions before opening caisse (sessionId = null) appear in today's journal.
 * 2. Transactions after opening caisse (sessionId linked) appear in today's journal.
 * 3. Transactions with null session ID are fully included.
 * 4. Transactions belonging to previous dates are excluded from today's journal.
 * 5. Transactions belonging to Coffre are excluded unless representing a transfer affecting Caisse.
 * 6. Multiple transactions on the same date are ordered chronologically with accurate running balance.
 * 7. Cancelled transactions (status = cancelled) are strictly excluded.
 * 8. Transfers between Caisse and Coffre are isolated from operating revenues/expenses and correctly impact final balance.
 * 9. Closing and reopening caisse on the same day preserves the initial float of the day.
 * 10. No duplicate transaction inclusion across queries or sources.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_daily_journal.db");
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
  console.log("  SHOP ERP — SUITE DE TESTS : COMPLÉTUDE DU JOURNAL JOURNALIER DE CAISSE");
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
  const { getDailyCashJournal } = await import("@/app/cash/actions");

  // Récupération des comptes de trésorerie existants (créés par les migrations)
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
        openingBalance: 100000,
      },
    });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  const customer = await prisma.customer.create({
    data: { name: "Client Test Journal", phone: "0555998877" },
  });

  const supplier = await prisma.supplier.create({
    data: { name: "Fournisseur Test Journal", phone: "0555112233" },
  });

  // SCÉNARIO 1 & 3: Transactions créées AVANT ouverture de session (sessionId = null)
  console.log("--- SCÉNARIO 1 & 3: Transactions avant ouverture de session (sessionId = null) ---");
  try {
    const p1 = await prisma.payment.create({
      data: {
        reference: "PAY-TEST-PRE-01",
        amount: 4000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: null,
        paymentDate: new Date(),
      },
    });

    const exp1 = await prisma.expense.create({
      data: {
        reference: "DEP-TEST-PRE-01",
        amount: 500,
        method: "cash",
        type: "expense",
        category: "supplies",
        description: "Achat fournitures avant session",
        accountId: caisse.id,
        sessionId: null,
        date: new Date(),
      },
    });

    const journal1 = await getDailyCashJournal(todayStr);
    assert(journal1.items.some((i) => i.reference === p1.reference), "Paiement avant session manquant dans le journal");
    assert(journal1.items.some((i) => i.reference === exp1.reference), "Dépense avant session manquante dans le journal");
    assert(journal1.totalInflows === 4000, `Total entrées incorrect: ${journal1.totalInflows} (attendu: 4000)`);
    assert(journal1.totalOutflows === 500, `Total sorties incorrect: ${journal1.totalOutflows} (attendu: 500)`);
    assert(journal1.theoreticalFinalBalance === 3500, `Solde final incorrect: ${journal1.theoreticalFinalBalance} (attendu: 3500)`);

    console.log("  [TEST 01] PASS: Opérations avant ouverture de session incluses");
    console.log("  [TEST 03] PASS: Opérations avec sessionId = null incluses avec exactitude");
    results.push({ num: 1, name: "Opérations avant ouverture de session", passed: true });
    results.push({ num: 3, name: "Opérations avec sessionId = null incluses", passed: true });
  } catch (err: any) {
    console.error("  [TEST 01 & 03] FAIL:", err.message);
    results.push({ num: 1, name: "Opérations avant ouverture de session", passed: false, error: err.message });
    results.push({ num: 3, name: "Opérations avec sessionId = null incluses", passed: false, error: err.message });
  }

  // SCÉNARIO 2: Ouverture d'une session et transactions APRÈS ouverture
  console.log("\n--- SCÉNARIO 2: Ouverture de session et opérations en cours de session ---");
  let session1: any;
  try {
    session1 = await prisma.cashSession.create({
      data: {
        reference: `SESS-${todayStr}-01`,
        openedAt: new Date(),
        status: "open",
        openingAmount: 0,
      },
    });

    const p2 = await prisma.payment.create({
      data: {
        reference: "PAY-TEST-POST-01",
        amount: 25000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: session1.id,
        paymentDate: new Date(),
      },
    });

    const journal2 = await getDailyCashJournal(todayStr);
    assert(journal2.items.some((i) => i.reference === p2.reference), "Paiement post-ouverture manquant dans le journal");
    assert(journal2.totalInflows === 29000, `Total entrées incorrect: ${journal2.totalInflows} (attendu: 29000)`);
    assert(journal2.theoreticalFinalBalance === 28500, `Solde final incorrect: ${journal2.theoreticalFinalBalance} (attendu: 28500)`);

    console.log("  [TEST 02] PASS: Opérations après ouverture et rattachées à la session incluses");
    results.push({ num: 2, name: "Opérations en session incluses", passed: true });
  } catch (err: any) {
    console.error("  [TEST 02] FAIL:", err.message);
    results.push({ num: 2, name: "Opérations en session incluses", passed: false, error: err.message });
  }

  // SCÉNARIO 4: Transactions des jours antérieurs exclues du journal d'aujourd'hui
  console.log("\n--- SCÉNARIO 4: Exclusion stricte des transactions des dates antérieures ---");
  try {
    const yesterdayPayment = await prisma.payment.create({
      data: {
        reference: "PAY-TEST-YESTERDAY",
        amount: 50000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: null,
        paymentDate: yesterdayDate,
        createdAt: yesterdayDate,
      },
    });

    const journalToday = await getDailyCashJournal(todayStr);
    assert(
      !journalToday.items.some((i) => i.reference === yesterdayPayment.reference),
      "La transaction d'hier a pollué le journal d'aujourd'hui"
    );

    console.log("  [TEST 04] PASS: Transaction d'hier exclue du journal d'aujourd'hui");
    results.push({ num: 4, name: "Exclusion des dates antérieures", passed: true });
  } catch (err: any) {
    console.error("  [TEST 04] FAIL:", err.message);
    results.push({ num: 4, name: "Exclusion des dates antérieures", passed: false, error: err.message });
  }

  // SCÉNARIO 5: Transactions de Coffre exclues du journal de Caisse
  console.log("\n--- SCÉNARIO 5: Exclusion stricte des transactions affectant Coffre magasin ---");
  try {
    const coffreExpense = await prisma.expense.create({
      data: {
        reference: "DEP-TEST-COFFRE",
        amount: 8000,
        method: "cash",
        type: "expense",
        category: "rent",
        description: "Loyer payé depuis le coffre",
        accountId: coffre.id,
        sessionId: null,
        date: new Date(),
      },
    });

    const journalCaisse = await getDailyCashJournal(todayStr);
    assert(
      !journalCaisse.items.some((i) => i.reference === coffreExpense.reference),
      "Une dépense du Coffre est apparue dans le journal de Caisse"
    );

    console.log("  [TEST 05] PASS: Transaction du Coffre correctement isolée et exclue de la Caisse");
    results.push({ num: 5, name: "Exclusion des autres comptes (Coffre)", passed: true });
  } catch (err: any) {
    console.error("  [TEST 05] FAIL:", err.message);
    results.push({ num: 5, name: "Exclusion des autres comptes (Coffre)", passed: false, error: err.message });
  }

  // SCÉNARIO 6: Plusieurs transactions et running balance chronologique
  console.log("\n--- SCÉNARIO 6: Running balance chronologique avec transactions multiples ---");
  try {
    const journal6 = await getDailyCashJournal(todayStr);
    let prevBal = journal6.openingBalance;
    for (const item of journal6.items) {
      const expectedBal = Math.round((prevBal + item.inflow - item.outflow) * 100) / 100;
      assert(
        item.runningBalance === expectedBal,
        `Running balance incorrect sur ${item.reference}: obtenu ${item.runningBalance}, attendu ${expectedBal}`
      );
      prevBal = item.runningBalance;
    }
    assert(prevBal === journal6.theoreticalFinalBalance, "Le solde cumulé final ne correspond pas à theoreticalFinalBalance");

    console.log("  [TEST 06] PASS: Running balance chronologique rigoureux sur chaque ligne");
    results.push({ num: 6, name: "Running balance chronologique", passed: true });
  } catch (err: any) {
    console.error("  [TEST 06] FAIL:", err.message);
    results.push({ num: 6, name: "Running balance chronologique", passed: false, error: err.message });
  }

  // SCÉNARIO 7: Exclusion des transactions annulées
  console.log("\n--- SCÉNARIO 7: Exclusion des transactions annulées (status = cancelled) ---");
  try {
    const cancelledPayment = await prisma.payment.create({
      data: {
        reference: "PAY-TEST-CANCELLED",
        amount: 70000,
        method: "cash",
        status: "cancelled",
        accountId: caisse.id,
        sessionId: session1.id,
        paymentDate: new Date(),
      },
    });

    const journal7 = await getDailyCashJournal(todayStr);
    assert(
      !journal7.items.some((i) => i.reference === cancelledPayment.reference),
      "Un paiement annulé est inclus dans le journal de caisse"
    );

    console.log("  [TEST 07] PASS: Les paiements annulés sont strictement exclus du journal");
    results.push({ num: 7, name: "Exclusion transactions annulées", passed: true });
  } catch (err: any) {
    console.error("  [TEST 07] FAIL:", err.message);
    results.push({ num: 7, name: "Exclusion transactions annulées", passed: false, error: err.message });
  }

  // SCÉNARIO 8: Transferts internes Caisse <-> Coffre
  console.log("\n--- SCÉNARIO 8: Transferts internes Caisse <-> Coffre traités hors charges d'exploitation ---");
  try {
    // Virement Caisse -> Coffre (départ de fonds)
    const tOut = await prisma.treasuryTransfer.create({
      data: {
        reference: "TRF-TEST-OUT",
        fromAccountId: caisse.id,
        toAccountId: coffre.id,
        amount: 10000,
        motif: "Dépôt Caisse vers Coffre",
        paymentMethod: "cash",
        date: new Date(),
        sessionId: session1.id,
      },
    });

    // Virement Coffre -> Caisse (apport de monnaie)
    const tIn = await prisma.treasuryTransfer.create({
      data: {
        reference: "TRF-TEST-IN",
        fromAccountId: coffre.id,
        toAccountId: caisse.id,
        amount: 3000,
        motif: "Alimentation monnaie depuis Coffre",
        paymentMethod: "cash",
        date: new Date(),
        sessionId: session1.id,
      },
    });

    const journal8 = await getDailyCashJournal(todayStr);
    assert(journal8.transfersOut === 10000, `Transfers out incorrect: ${journal8.transfersOut} (attendu: 10000)`);
    assert(journal8.transfersIn === 3000, `Transfers in incorrect: ${journal8.transfersIn} (attendu: 3000)`);
    assert(journal8.netTransfers === -7000, `Net transfers incorrect: ${journal8.netTransfers} (attendu: -7000)`);
    // Vérifier que les transferts ne sont pas comptés comme charges d'exploitation
    assert(journal8.operatingOutflows === 500, `Operating outflows altérés par les transferts: ${journal8.operatingOutflows}`);
    assert(journal8.operatingInflows === 29000, `Operating inflows altérés par les transferts: ${journal8.operatingInflows}`);
    // Solde théorique = 0 + 29000 - 500 + 3000 - 10000 = 21500
    assert(journal8.theoreticalFinalBalance === 21500, `Solde final avec transferts incorrect: ${journal8.theoreticalFinalBalance} (attendu: 21500)`);

    console.log("  [TEST 08] PASS: Transferts isolés des charges d'exploitation et impact physique exact");
    results.push({ num: 8, name: "Isolation des transferts internes", passed: true });
  } catch (err: any) {
    console.error("  [TEST 08] FAIL:", err.message);
    results.push({ num: 8, name: "Isolation des transferts internes", passed: false, error: err.message });
  }

  // SCÉNARIO 9: Clôture et réouverture de caisse le même jour
  console.log("\n--- SCÉNARIO 9: Clôture et réouverture de caisse le même jour ---");
  try {
    // Clôture de la session 1
    await prisma.cashSession.update({
      where: { id: session1.id },
      data: {
        status: "closed",
        closedAt: new Date(),
        closingAmount: 21500,
        retainedAmount: 5000, // On laisse 5 000 DA en caisse pour la 2ème session
      },
    });

    // Ouverture de la session 2 le même jour
    const session2 = await prisma.cashSession.create({
      data: {
        reference: `SESS-${todayStr}-02`,
        openedAt: new Date(Date.now() + 60000),
        status: "open",
        openingAmount: 5000, // Reprise du reliquat
      },
    });

    // Opération dans la session 2
    const p3 = await prisma.payment.create({
      data: {
        reference: "PAY-TEST-SESS2-01",
        amount: 8000,
        method: "cash",
        status: "completed",
        accountId: caisse.id,
        sessionId: session2.id,
        paymentDate: new Date(Date.now() + 120000),
      },
    });

    const journal9 = await getDailyCashJournal(todayStr);
    // Le solde initial du jour doit être celui de la première session (0 DA)
    assert(journal9.openingBalance === 0, `Solde initial du jour incorrect: ${journal9.openingBalance} (attendu: 0)`);
    assert(journal9.items.some((i) => i.reference === p3.reference), "Opération de session 2 manquante");
    assert(journal9.totalInflows === 37000, `Inflows totaux incorrects: ${journal9.totalInflows} (attendu: 37000)`);
    // Solde final = 0 (init) + 37000 (entrées) - 500 (dépenses) - 7000 (net transferts) = 29500
    assert(journal9.theoreticalFinalBalance === 29500, `Solde final incorrect: ${journal9.theoreticalFinalBalance} (attendu: 29500)`);

    console.log("  [TEST 09] PASS: Clôture et réouverture même jour gérées sans distorsion de solde initial");
    results.push({ num: 9, name: "Sessions multiples même jour", passed: true });
  } catch (err: any) {
    console.error("  [TEST 09] FAIL:", err.message);
    results.push({ num: 9, name: "Sessions multiples même jour", passed: false, error: err.message });
  }

  // SCÉNARIO 10: Unicité stricte (aucun double comptage)
  console.log("\n--- SCÉNARIO 10: Unicité stricte et anti-double-comptage ---");
  try {
    const journal10 = await getDailyCashJournal(todayStr);
    const seenIds = new Set<string>();
    for (const item of journal10.items) {
      assert(!seenIds.has(item.id), `Transaction en double détectée dans le journal: ${item.id}`);
      seenIds.add(item.id);
    }

    const sumInflows = Math.round(journal10.items.reduce((s, i) => s + i.inflow, 0) * 100) / 100;
    const sumOutflows = Math.round(journal10.items.reduce((s, i) => s + i.outflow, 0) * 100) / 100;
    const expectedInflows = Math.round((journal10.operatingInflows + journal10.transfersIn) * 100) / 100;
    const expectedOutflows = Math.round((journal10.operatingOutflows + journal10.transfersOut) * 100) / 100;

    assert(sumInflows === expectedInflows, `Somme entrées incohérente: ${sumInflows} vs ${expectedInflows}`);
    assert(sumOutflows === expectedOutflows, `Somme sorties incohérente: ${sumOutflows} vs ${expectedOutflows}`);

    console.log("  [TEST 10] PASS: Chaque opération est comptabilisée exactement une seule fois");
    results.push({ num: 10, name: "Unicité et absence de double comptage", passed: true });
  } catch (err: any) {
    console.error("  [TEST 10] FAIL:", err.message);
    results.push({ num: 10, name: "Unicité et absence de double comptage", passed: false, error: err.message });
  }

  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DES TESTS DU JOURNAL JOURNALIER DE CAISSE");
  console.log("================================================================================");
  let passedCount = 0;
  results.sort((a, b) => a.num - b.num);
  for (const r of results) {
    console.log(`  [TEST ${String(r.num).padStart(2, "0")}] ${r.passed ? "PASS" : "FAIL"}: ${r.name}`);
    if (r.passed) passedCount++;
  }
  console.log("--------------------------------------------------------------------------------");
  console.log(`  TOTAL: ${results.length} | RÉUSSIS: ${passedCount} | ÉCHECS: ${results.length - passedCount}`);
  console.log("================================================================================");

  // Nettoyage de la base de test
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch {}

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Erreur fatale de la suite de tests:", e);
  process.exit(1);
});
