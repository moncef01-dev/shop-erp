/**
 * Integration Test Suite: Treasury Closing Temporary Edits, Movement Edits & Traced Adjustments
 *
 * Runs against an isolated temporary SQLite database: prisma/test_treasury_closing_audit.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_treasury_closing_audit.db");
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
  console.log("  SHOP ERP — TESTS CLÔTURE ÉDITABLE, AUDIT MOVEMENTS & AJUSTEMENTS TRÉSORERIE");
  console.log("  Base isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Appliquer toutes les migrations
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

  // 2. Importer Prisma et modules
  const { prisma } = await import("@/lib/prisma");
  const treasuryActions = await import("@/app/cash/treasury-actions");
  const cashActions = await import("@/app/cash/actions");
  const supplierActions = await import("@/app/suppliers/actions");

  // Setup Accounts - clean any seeded accounts first
  await prisma.treasuryTransfer.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.treasuryAccount.deleteMany();

  const caisseAccount = await prisma.treasuryAccount.create({
    data: {
      code: "ACC-CAISSE",
      name: "Caisse Journalière",
      type: "cash_register",
      openingBalance: 0,
      isDefault: true,
      isActive: true,
    },
  });

  const coffreAccount = await prisma.treasuryAccount.create({
    data: {
      code: "ACC-COFFRE",
      name: "Coffre Magasin",
      type: "safe",
      openingBalance: 100000,
      isActive: true,
    },
  });

  // ─── SCENARIO 1: Closing session with partial transfer & preserved originals ─
  let closedSessionId: number = 0;
  await runScenario("SCENARIO 1", "Clôture de session avec préservation des valeurs d'origine", async () => {
    // Ouvrir une session
    const openRes = await cashActions.openCashSessionAction(50000, "Ouverture session test");
    assert(openRes.success && !!openRes.data, "Ouverture session doit réussir");
    const sessionId = (openRes.data as { id: number }).id;
    closedSessionId = sessionId;

    // Ajouter un encaissement direct de 100 000 DA via Payment
    await prisma.payment.create({
      data: {
        reference: "PAY-TEST-001",
        amount: 100000,
        method: "cash",
        status: "completed",
        notes: "Encaissement direct vente",
        sessionId,
        accountId: caisseAccount.id,
      },
    });

    // Clôture avec comptage physique de 148 000 DA (écart -2 000 DA)
    // et virement partiel de 120 000 DA vers le coffre (laisse 28 000 DA en caisse)
    const closeRes = await cashActions.closeCashSessionAction({
      sessionId,
      closingAmount: 148000,
      closingNotes: "Clôture session soir",
      transferAmount: 120000,
      transferDestinationAccountId: coffreAccount.id,
      transferNotes: "Transfert vers coffre",
    });

    assert(closeRes.success, `Clôture doit réussir: ${closeRes.error}`);

    const session = await prisma.cashSession.findUnique({ where: { id: sessionId } });
    assert(session !== null, "Session introuvable");
    assert(session!.status === "closed", "Session doit être fermée");
    assert(session!.closingAmount === 148000, "Montant clôture = 148 000 DA");
    assert(session!.originalClosingAmount === 148000, "originalClosingAmount = 148 000 DA");
    assert(session!.originalTheoreticalAmount === 150000, "originalTheoreticalAmount = 150 000 DA");
    assert(session!.originalDifference === -2000, "originalDifference = -2 000 DA");
    assert(session!.retainedAmount === 28000, "retainedAmount = 28 000 DA");

    // Vérifier que le virement de 120 000 DA a été créé et lié
    const transfer = await prisma.treasuryTransfer.findFirst({
      where: { sessionId },
    });
    assert(transfer !== null, "Transfert vers le coffre lié à la session doit exister");
    assert(transfer!.amount === 120000, "Montant transfert = 120 000 DA");
    assert(transfer!.fromAccountId === caisseAccount.id, "Source = Caisse");
    assert(transfer!.toAccountId === coffreAccount.id, "Dest = Coffre");
  });

  // ─── SCENARIO 2: Temporary Edit of Closed Session with Audit Trail ──────────
  await runScenario("SCENARIO 2", "Modification temporaire de session clôturée avec audit trail & réconciliation du transfert", async () => {
    // L'utilisateur s'aperçoit qu'un billet de 2000 DA avait été oublié dans le tiroir
    // Nouveau comptage physique réel : 150 000 DA (écart 0 DA)
    // Nouveau virement vers le coffre : 130 000 DA (laisse 20 000 DA en caisse)
    const editRes = await cashActions.editClosedCashSessionAction({
      sessionId: closedSessionId,
      newClosingAmount: 150000,
      newClosingNotes: "Correction : billet de 2 000 DA retrouvé dans le sous-tiroir",
      newTransferAmount: 130000,
      reason: "Comptage initial incomplet, rectification autorisée",
    });

    assert(editRes.success, `Modification clôture doit réussir: ${editRes.error}`);

    const updatedSession = await prisma.cashSession.findUnique({ where: { id: closedSessionId } });
    assert(updatedSession!.closingAmount === 150000, "Nouveau montant = 150 000 DA");
    assert(updatedSession!.difference === 0, "Nouvel écart = 0 DA");
    assert(updatedSession!.retainedAmount === 20000, "Nouveau reliquat = 20 000 DA");

    // Les valeurs d'origine doivent être intactes !
    assert(updatedSession!.originalClosingAmount === 148000, "originalClosingAmount préservé = 148 000 DA");
    assert(updatedSession!.originalTheoreticalAmount === 150000, "originalTheoreticalAmount préservé = 150 000 DA");
    assert(updatedSession!.originalDifference === -2000, "originalDifference préservé = -2 000 DA");

    // Audit trail
    assert(Boolean(updatedSession!.closingEditAudit), "Audit trail doit être présent");
    const audit = JSON.parse(updatedSession!.closingEditAudit!);
    assert(Array.isArray(audit) && audit.length === 1, "1 entrée d'audit");
    assert(audit[0].reason === "Comptage initial incomplet, rectification autorisée", "Motif enregistré dans l'audit");
    assert(audit[0].previous.closingAmount === 148000, "Ancien montant clôture dans l'audit");
    assert(audit[0].next.closingAmount === 150000, "Nouveau montant clôture dans l'audit");

    // Vérifier que le virement existant a été ajusté à 130 000 DA SANS créer de doublon
    const transfers = await prisma.treasuryTransfer.findMany({
      where: { sessionId: closedSessionId },
    });
    assert(transfers.length === 1, "Il ne doit JAMAIS y avoir de double virement pour la même session");
    assert(transfers[0].amount === 130000, "Montant transfert mis à jour à 130 000 DA");
  });

  // ─── SCENARIO 3: Editing an Internal Movement with Balance Revalidation ─────
  await runScenario("SCENARIO 3", "Modification d'un mouvement de trésorerie avec historique d'édition", async () => {
    // Créer un transfert manuel de 50 000 DA du Coffre vers la Caisse
    const createRes = await treasuryActions.createTreasuryTransferAction({
      fromAccountId: coffreAccount.id,
      toAccountId: caisseAccount.id,
      amount: 50000,
      paymentMethod: "cash",
      motif: "Alimentation caisse pour monnaie",
    });

    assert(createRes.success && !!createRes.data, "Création transfert doit réussir");
    const transferId = (createRes.data as { id: number }).id;

    // Modifier le transfert à 30 000 DA (avec motif d'audit)
    const updateRes = await treasuryActions.updateTreasuryTransferAction({
      transferId,
      amount: 30000,
      observation: "Rectification : seulement 30 000 DA prélevés",
      editReason: "Erreur de saisie initiale",
    });

    assert(updateRes.success, `Modification transfert doit réussir: ${updateRes.error}`);

    const transfer = await prisma.treasuryTransfer.findUnique({ where: { id: transferId } });
    assert(transfer!.amount === 30000, "Montant transfert = 30 000 DA");
    assert(Boolean(transfer!.editHistory), "Historique d'édition doit être renseigné");

    const history = JSON.parse(transfer!.editHistory!);
    assert(Array.isArray(history) && history.length === 1, "1 entrée dans l'historique");
    assert(history[0].previous.amount === 50000, "Ancien montant 50 000 DA");
    assert(history[0].new.amount === 30000, "Nouveau montant 30 000 DA");
    assert(history[0].reason === "Erreur de saisie initiale", "Motif tracé");

    // Tentative de modification à un montant dépassant le solde disponible (ex: 90 000 000 DA)
    const invalidUpdateRes = await treasuryActions.updateTreasuryTransferAction({
      transferId,
      amount: 90000000,
      observation: "Montant excessif impossible",
      editReason: "Test rejet",
    });
    assert(!invalidUpdateRes.success, "La modification avec solde insuffisant doit être rejetée");
  });

  // ─── SCENARIO 4: Auditable Balance Adjustment ──────────────────────────────
  await runScenario("SCENARIO 4", "Ajustement tracé du solde d'un compte avec motif", async () => {
    const adjRes = await treasuryActions.adjustAccountBalanceAction({
      accountId: coffreAccount.id,
      amount: 15000,
      adjustmentType: "increase",
      reason: "Régularisation comptable après inventaire physique du coffre",
    });

    assert(adjRes.success, "Ajustement tracé doit réussir");

    // Doit être tracé dans la table Expense avec type 'income'
    const adjTx = await prisma.expense.findFirst({
      where: {
        accountId: coffreAccount.id,
        type: "income",
      },
    });
    assert(adjTx !== null, "Une transaction d'ajustement doit être enregistrée");
    assert(adjTx!.amount === 15000, "Montant = 15 000 DA");
    assert(adjTx!.description!.includes("inventaire physique"), "Motif présent dans la description");
  });

  // ─── SCENARIO 5: Saisie dette antérieure fournisseur sans impact stock/caisse
  await runScenario("SCENARIO 5", "Dette fournisseur antérieure : sans commande, sans stock, sans trésorerie", async () => {
    const supplier = await prisma.supplier.create({
      data: {
        name: "Meubles du Sud SARL",
        phone: "0550998877",
        isActive: true,
      },
    });

    const stockCountBefore = await prisma.product.count();

    const res = await supplierActions.recordSupplierInitialDebtAction({
      supplierId: supplier.id,
      amount: 250000,
      notes: "Solde reporté exercice précédent",
      debtDate: "2026-01-01",
    });
    assert(res.success, `Ajout dette antérieure doit réussir: ${res.error}`);

    // Vérifier solde fournisseur
    const debtCalc = await supplierActions.calculateSupplierDebt(supplier.id);
    assert(debtCalc.outstandingDebt === 250000, "Solde dû = 250 000 DA");
    assert(debtCalc.initialDebt === 250000, "Dette initiale = 250 000 DA");
    assert(debtCalc.totalPurchases === 0, "Aucun achat créé");

    // Caisse et stocks intacts
    const caisseMovements = await treasuryActions.getAccountMovements(caisseAccount.id);
    assert(caisseMovements.account !== null, "Détails caisse récupérés");
    const stockCountAfter = await prisma.product.count();
    assert(stockCountAfter === stockCountBefore, "Nombre de produits en stock inchangé");
  });

  // ─── SCENARIO 6: Prevent Wheel Event Handler Verification ──────────────────
  await runScenario("SCENARIO 6", "Vérification composant global PreventWheelOnNumberInputs", async () => {
    const compFile = path.resolve(process.cwd(), "src", "components", "common", "PreventWheelOnNumberInputs.tsx");
    assert(fs.existsSync(compFile), "Le composant PreventWheelOnNumberInputs.tsx doit exister");
    const compContent = fs.readFileSync(compFile, "utf-8");
    assert(compContent.includes('type === "number"'), "Vérifie le type number des inputs");
    assert(compContent.includes("blur()"), "Effectue un blur pour empêcher la modification de la valeur par la molette");
    assert(compContent.includes("capture: true"), "Utilise la phase de capture pour intercepter l'événement");
  });

  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DES TESTS CLÔTURE & TRÉSORERIE");
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

main().catch((err) => {
  console.error("FATAL ERROR in test runner:", err);
  process.exit(1);
});
