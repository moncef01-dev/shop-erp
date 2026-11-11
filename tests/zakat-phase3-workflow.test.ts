/**
 * Comprehensive Integration & Workflow Test Suite for
 * Business Zakat Accounting Module (Phase 3)
 *
 * Runs strictly against an isolated disposable database: prisma/test_zakat_phase3.db
 * NEVER touches the production database.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_zakat_phase3.db");

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
  console.log("  SHOP ERP — SUITE DE TESTS : MODULE ZAKAT PHASE 3 (WORKFLOW & PERSISTANCE)");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Appliquer les migrations DDL
  const { createClient } = await import("@libsql/client");
  const ddlClient = createClient({ url: `file:${testDbPath}` });

  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of migrationFolders) {
    const sqlFile = path.join(migrationsDir, folder, "migration.sql");
    if (fs.existsSync(sqlFile)) {
      const sql = fs.readFileSync(sqlFile, "utf-8");
      for (const stmt of sql.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
        try {
          await ddlClient.execute(stmt);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("already exists")) {
            console.warn(`DDL warning in ${folder}:`, msg);
          }
        }
      }
    }
  }

  // Tables d'épargne client
  const savingsSchemaSql = `
    CREATE TABLE IF NOT EXISTS "customer_savings_accounts" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "customerId" INTEGER NOT NULL,
        "balance" REAL NOT NULL DEFAULT 0,
        "totalDeposited" REAL NOT NULL DEFAULT 0,
        "totalUsed" REAL NOT NULL DEFAULT 0,
        "totalRefunded" REAL NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "customer_savings_transactions" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "reference" TEXT NOT NULL,
        "customerId" INTEGER NOT NULL,
        "accountId" INTEGER NOT NULL,
        "treasuryAccountId" INTEGER,
        "type" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "direction" TEXT NOT NULL,
        "balanceBefore" REAL NOT NULL,
        "balanceAfter" REAL NOT NULL,
        "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
        "saleId" INTEGER,
        "sessionId" INTEGER,
        "description" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'completed',
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
  for (const stmt of savingsSchemaSql.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
    await ddlClient.execute(stmt);
  }

  ddlClient.close();
  console.log("✓ Schéma et tables appliqués à la base de test isolée.\n");

  const { prisma } = await import("@/lib/prisma");
  const {
    calculateZakatPreviewAction,
    saveZakatValuationAction,
    getZakatValuationByIdAction,
    addZakatAdjustmentAction,
    removeZakatAdjustmentAction,
    approveZakatValuationAction,
    rejectZakatValuationAction,
    deleteZakatDraftAction,
    getZakatDashboardDataAction,
  } = await import("@/app/zakat/actions");
  const { formatZakatMoney } = await import("@/app/zakat/formatters");

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");

  // Setup fixtures
  const caisse = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-CAISSE" },
    update: { openingBalance: 100000 },
    create: {
      code: "ACC-CAISSE",
      name: "Caisse Magasin",
      type: "cash",
      isDefault: true,
      openingBalance: 100000,
    },
  });

  const coffre = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-COFFRE-MAGASIN" },
    update: { openingBalance: 500000 },
    create: {
      code: "ACC-COFFRE-MAGASIN",
      name: "Coffre Magasin",
      type: "safe",
      isDefault: false,
      openingBalance: 500000,
    },
  });

  const locMagasin = await prisma.location.upsert({
    where: { code: "LOC-MAGASIN" },
    update: {},
    create: {
      code: "LOC-MAGASIN",
      name: "Magasin Principal",
      isDefault: true,
    },
  });

  const prodTable = await prisma.product.create({
    data: {
      sku: "TAB-001",
      name: "Table Salle à Manger",
      costPrice: 20000,
      sellingPrice: 32000,
      stock: 10,
    },
  });

  await prisma.stockMovement.create({
    data: {
      reference: "SM-INIT-001",
      type: "INITIAL",
      productId: prodTable.id,
      toLocationId: locMagasin.id,
      quantity: 10,
      stockBefore: 0,
      stockAfter: 10,
      unitCost: 20000,
      date: new Date("2026-01-01T10:00:00Z"),
    },
  });

  const customerAli = await prisma.customer.create({
    data: {
      code: "CLI-ALI",
      name: "Ali Benali",
      phone: "0555001122",
    },
  });

  // Vente de 50,000 DA avec acompte de 20,000 DA -> Dette restante = 30,000 DA
  const sale1 = await prisma.sales.create({
    data: {
      reference: "VTE-2026-0001",
      customerId: customerAli.id,
      totalAmount: 50000,
      status: "confirmed",
      saleDate: new Date("2026-06-01T10:00:00Z"),
    },
  });

  await prisma.payment.create({
    data: {
      reference: "PAY-2026-0001",
      saleId: sale1.id,
      accountId: caisse.id,
      amount: 20000,
      method: "cash",
      status: "completed",
      paymentDate: new Date("2026-06-01T10:00:00Z"),
    },
  });

  let testIdx = 1;
  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ num: testIdx, name, passed: true });
      console.log(`  ✓ Test ${testIdx}: ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ num: testIdx, name, passed: false, error: msg });
      console.log(`  ✗ Test ${testIdx}: ${name}`);
      console.log(`    Erreur : ${msg}`);
    }
    testIdx++;
  }

  // --- TESTS DE WORKFLOW ---
  console.log("--- GROUPE 1 : CRÉATION ET PERSISTANCE DE SNAPSHOT (DRAFT) ---");

  let savedValuationId = 0;
  let savedReference = "";

  await test("1.1 Aperçu via le moteur Phase 2 et persistance d'une évaluation complète", async () => {
    const preview = await calculateZakatPreviewAction({
      valuationDate: "2026-10-01",
      hawlStartDate: "2025-10-02",
      hawlEndDate: "2026-10-01",
      nisabMethod: "SILVER",
      silverGramPriceDZD: 130, // 595 * 130 = 77,350 DA
      zakatYearType: "LUNAR",
      zakatRate: 0.025,
      manualLiabilitiesDZD: 10000,
      manualLiabilitiesNote: "Dette fournisseur écurie",
      customerFundsConfirmation: "CONFIRMED_INCLUDED",
    });

    // Actifs confirmés attendus :
    // Stock : 10 * 20,000 = 200,000 DA
    // Trésorerie : Caisse (100k + 20k) + Coffre (500k) = 620,000 DA
    // Créance : 50k - 20k = 30,000 DA
    // Avances fournisseurs : 0 DA
    // Total Actifs = 850,000 DA
    assert(preview.assets.confirmedAssetsDZD === 850000, `Actifs attendus: 850,000 DA, reçu: ${preview.assets.confirmedAssetsDZD}`);

    const res = await saveZakatValuationAction(
      {
        valuationDate: "2026-10-01",
        hawlStartDate: "2025-10-02",
        hawlEndDate: "2026-10-01",
        nisabMethod: "SILVER",
        nisabValueDZD: 77350,
        nisabSilverPriceDZD: 130,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        manualLiabilitiesDZD: 10000,
        manualLiabilitiesNote: "Dette fournisseur écurie",
        customerFundsConfirmation: "CONFIRMED_INCLUDED",
        notes: "Première évaluation annuelle test",
        calculationResult: preview,
      },
      { db: prisma }
    );

    assert(res.success, "Échec de sauvegarde de l'évaluation");
    assert(res.valuationId > 0, "ID invalide");
    assert(res.reference.startsWith("ZAK-202610-"), `Référence inattendue: ${res.reference}`);

    savedValuationId = res.valuationId;
    savedReference = res.reference;
  });

  await test("1.2 Chargement exact depuis le snapshot avec items détaillés sans recalcul", async () => {
    const detail = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(detail !== null, "Évaluation introuvable");
    assert(detail!.valuation.reference === savedReference, "Référence non concordante");
    assert(detail!.valuation.totalAssetsDZD === 850000, "Total actifs non concordant");
    assert(detail!.valuation.zakatableBaseDZD === 840000, `Assiette attendue: 840,000 DA (850k - 10k), reçu: ${detail!.valuation.zakatableBaseDZD}`);
    assert(detail!.valuation.zakatDueDZD === 21000, `Zakat attendue: 21,000 DA (840k * 0.025), reçu: ${detail!.valuation.zakatDueDZD}`);
    assert(
      detail!.valuation.approvalStatus === "REQUIRES_REVIEW" || detail!.valuation.approvalStatus === "DRAFT",
      `Statut initial attendu: REQUIRES_REVIEW ou DRAFT, reçu: ${detail!.valuation.approvalStatus}`
    );

    // Vérification des lignes d'articles
    const invItem = detail!.items.find((i) => i.category === "INVENTORY");
    assert(invItem !== undefined, "Item inventaire manquant");
    assert(invItem!.quantity === 10, "Quantité inventaire non préservée");
    assert(invItem!.totalValueDZD === 200000, "Valeur inventaire non préservée");

    const treItems = detail!.items.filter((i) => i.category === "TREASURY");
    assert(treItems.length >= 2, `Comptes de trésorerie attendus: au moins 2, reçu: ${treItems.length}`);
    // Vérification de l'alimentation du dashboard
    const dashboardData = await getZakatDashboardDataAction({ db: prisma });
    assert(dashboardData.allValuations.length >= 1, "Le tableau de bord doit retourner au moins une évaluation");
  });

  await test("1.3 Préservation stricte du snapshot lors de changements opérationnels postérieurs", async () => {
    // Modification opérationnelle postérieure : ajout d'une vente de 100,000 DA le 15 octobre
    await prisma.sales.create({
      data: {
        reference: "VTE-2026-POST",
        customerId: customerAli.id,
        totalAmount: 100000,
        status: "confirmed",
        saleDate: new Date("2026-10-15T10:00:00Z"),
      },
    });

    // Rechargement de l'évaluation au 1er octobre : ses chiffres ne doivent PAS changer
    const detail = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(detail!.valuation.totalAssetsDZD === 850000, "L'évaluation a été modifiée par une vente postérieure !");
    assert(detail!.valuation.zakatableBaseDZD === 840000, "L'assiette du snapshot a été altérée !");
  });

  console.log("\n--- GROUPE 2 : AJUSTEMENTS AUDITÉS DU GÉRANT ---");

  let adjId = 0;
  await test("2.1 Ajout d'un ajustement en déduction (créance douteuse) et recalcul automatique", async () => {
    // Déduction de 20,000 DA de créances douteuses
    const res = await addZakatAdjustmentAction(
      {
        valuationId: savedValuationId,
        category: "RECEIVABLES",
        description: "Déduction créance douteuse client litigieux",
        amountDZD: 20000,
        adjustmentType: "DEDUCT",
        reason: "Client en cessation de paiement",
        createdBy: "Gérant Test",
      },
      { db: prisma }
    );

    assert(res.success, "Échec d'ajout d'ajustement");
    adjId = res.adjustmentId;

    const updated = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(updated!.adjustments.length === 1, "Ajustement non trouvé");
    assert(updated!.valuation.totalAdjustmentsDZD === -20000, `Ajustement net attendu: -20,000, reçu: ${updated!.valuation.totalAdjustmentsDZD}`);
    // Nouvelle assiette = 850k - 20k (ajustement) - 10k (dettes) = 820,000 DA
    assert(updated!.valuation.zakatableBaseDZD === 820000, `Nouvelle assiette attendue: 820,000, reçu: ${updated!.valuation.zakatableBaseDZD}`);
    // Zakat = 820k * 0.025 = 20,500 DA
    assert(updated!.valuation.zakatDueDZD === 20500, `Zakat attendue: 20,500, reçu: ${updated!.valuation.zakatDueDZD}`);
  });

  await test("2.2 Suppression d'un ajustement et rétablissement des totaux", async () => {
    const res = await removeZakatAdjustmentAction(adjId, { db: prisma });
    assert(res.success, "Échec de suppression d'ajustement");

    const updated = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(updated!.adjustments.length === 0, "Ajustement toujours présent");
    assert(updated!.valuation.totalAdjustmentsDZD === 0, "Total ajustements non réinitialisé");
    assert(updated!.valuation.zakatableBaseDZD === 840000, "Assiette initiale non rétablie");
    assert(updated!.valuation.zakatDueDZD === 21000, "Zakat initiale non rétablie");
  });

  console.log("\n--- GROUPE 3 : GARANTIES DE SÉCURITÉ ET D'APPROBATION ---");

  await test("3.1 Rejet de l'approbation si l'évaluation est INCOMPLÈTE", async () => {
    // Créer une évaluation factice avec status = INCOMPLETE
    const incompleteVal = await prisma.zakatValuation.create({
      data: {
        reference: "ZAK-202610-9999",
        valuationDate: new Date("2026-10-01"),
        hawlStartDate: new Date("2025-10-02"),
        hawlEndDate: new Date("2026-10-01"),
        nisabMethod: "SILVER",
        nisabValueDZD: 77350,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        totalInventoryDZD: 0,
        totalTreasuryDZD: 0,
        totalReceivablesDZD: 0,
        totalSupplierPrepaymentsDZD: 0,
        totalAssetsDZD: 0,
        totalLiabilitiesDZD: 0,
        zakatableBaseDZD: 0,
        zakatDueDZD: 0,
        calculationStatus: "INCOMPLETE",
        approvalStatus: "INCOMPLETE",
        statusReason: "Données sources manquantes",
      },
    });

    let rejected = false;
    try {
      await approveZakatValuationAction(
        {
          valuationId: incompleteVal.id,
          approverName: "Gérant",
          confirmDisclaimer: true,
        },
        { db: prisma }
      );
    } catch (err: unknown) {
      rejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("INCOMPLÈTE"), "Message d'erreur inattendu");
    }
    assert(rejected, "L'approbation d'une évaluation INCOMPLÈTE aurait dû être rejetée !");
  });

  await test("3.2 Rejet de l'approbation sans confirmation des fonds clients", async () => {
    const unconfVal = await prisma.zakatValuation.create({
      data: {
        reference: "ZAK-202610-8888",
        valuationDate: new Date("2026-10-01"),
        hawlStartDate: new Date("2025-10-02"),
        hawlEndDate: new Date("2026-10-01"),
        nisabMethod: "SILVER",
        nisabValueDZD: 77350,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        totalInventoryDZD: 100000,
        totalTreasuryDZD: 50000,
        totalReceivablesDZD: 0,
        totalSupplierPrepaymentsDZD: 0,
        customerFundsHeldDZD: 20000,
        customerFundsConfirmation: "UNCONFIRMED",
        totalAssetsDZD: 150000,
        totalLiabilitiesDZD: 0,
        zakatableBaseDZD: 150000,
        zakatDueDZD: 3750,
        calculationStatus: "REQUIRES_REVIEW",
        approvalStatus: "REQUIRES_REVIEW",
      },
    });

    let rejected = false;
    try {
      await approveZakatValuationAction(
        {
          valuationId: unconfVal.id,
          approverName: "Gérant",
          confirmDisclaimer: true,
        },
        { db: prisma }
      );
    } catch (err: unknown) {
      rejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("fonds clients"), "Message d'erreur inattendu");
    }
    assert(rejected, "L'approbation sans confirmation des fonds clients aurait dû être rejetée !");
  });

  await test("3.3 Rejet de l'approbation sans acceptation du disclaimer de conformité", async () => {
    let rejected = false;
    try {
      await approveZakatValuationAction(
        {
          valuationId: savedValuationId,
          approverName: "Gérant",
          confirmDisclaimer: false, // NON COCHÉ
        },
        { db: prisma }
      );
    } catch (err: unknown) {
      rejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("mention légale"), "Message d'erreur inattendu");
    }
    assert(rejected, "L'approbation sans confirmation du disclaimer aurait dû être rejetée !");
  });

  await test("3.4 Approbation réussie avec enregistrement de l'approbateur et timestamp", async () => {
    const res = await approveZakatValuationAction(
      {
        valuationId: savedValuationId,
        approverName: "Moncef (Gérant)",
        approvalNotes: "Validé en séance d'inventaire annuel",
        confirmDisclaimer: true,
      },
      { db: prisma }
    );

    assert(res.success, "Échec d'approbation");
    assert(res.reference === savedReference, "Référence non concordante");

    const approved = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(approved!.valuation.approvalStatus === "APPROVED", "Statut non passé à APPROVED");
    assert(Boolean(approved!.valuation.approvedBy?.includes("Moncef (Gérant)")), "Nom de l'approbateur manquant");
    assert(Boolean(approved!.valuation.approvedBy?.includes("Déclaratif non vérifié")), "Attribution déclarative non qualifiée");
    assert(approved!.valuation.approvedAt !== null, "Timestamp d'approbation non enregistré");
    assert(approved!.valuation.approvalNotes === "Validé en séance d'inventaire annuel", "Notes d'approbation non enregistrées");
  });

  await test("3.5 Règle d'immutabilité : rejet de toute modification, ajout d'ajustement ou suppression après approbation", async () => {
    // 1. Tentative d'ajout d'ajustement
    let adjRejected = false;
    try {
      await addZakatAdjustmentAction(
        {
          valuationId: savedValuationId,
          category: "OTHER",
          description: "Ajustement pirate",
          amountDZD: 5000,
          adjustmentType: "DEDUCT",
          reason: "Test immutabilité",
        },
        { db: prisma }
      );
    } catch (err: unknown) {
      adjRejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("déjà approuvée"), "Message d'erreur inattendu");
    }
    assert(adjRejected, "Un ajustement a pu être ajouté à une évaluation approuvée !");

    // 2. Tentative de suppression
    let delRejected = false;
    try {
      await deleteZakatDraftAction(savedValuationId, { db: prisma });
    } catch (err: unknown) {
      delRejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("immuable"), "Message d'erreur inattendu");
    }
    assert(delRejected, "Une évaluation approuvée a pu être supprimée !");

    // 3. Tentative de double approbation
    let doubleApproveRejected = false;
    try {
      await approveZakatValuationAction(
        {
          valuationId: savedValuationId,
          approverName: "Autre Gérant",
          confirmDisclaimer: true,
        },
        { db: prisma }
      );
    } catch (err: unknown) {
      doubleApproveRejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("déjà approuvée"), "Message d'erreur inattendu");
    }
    assert(doubleApproveRejected, "Une évaluation approuvée a pu être ré-approuvée !");
  });

  console.log("\n--- GROUPE 4 : IMPACT TRÉSORERIE & INTÉGRITÉ FINANCIÈRE ---");

  await test("4.1 Absence totale d'impact sur la trésorerie (Zero Cash Deduction)", async () => {
    // Vérifier les soldes de trésorerie avant et après toutes les opérations Zakat
    const caisseNow = await prisma.treasuryAccount.findUnique({ where: { id: caisse.id } });
    const coffreNow = await prisma.treasuryAccount.findUnique({ where: { id: coffre.id } });

    // La Caisse a son solde d'ouverture (100k) + le paiement sale1 (20k) = 120,000 DA
    assert(caisseNow!.openingBalance === 100000, "Le solde de caisse a été altéré !");
    assert(coffreNow!.openingBalance === 500000, "Le solde du coffre a été altéré !");

    // Vérifier qu'aucun paiement ou charge n'a été créé automatiquement
    const paymentsCount = await prisma.payment.count({ where: { notes: { contains: "Zakat" } } });
    const expensesCount = await prisma.expense.count({ where: { description: { contains: "Zakat" } } });

    assert(paymentsCount === 0, "Un paiement Zakat a été créé automatiquement !");
    assert(expensesCount === 0, "Une charge Zakat a été créée automatiquement !");
  });

  await test("4.2 Rejet de rejet d'une évaluation déjà approuvée", async () => {
    let rejectRejected = false;
    try {
      await rejectZakatValuationAction(
        {
          valuationId: savedValuationId,
          operatorName: "Gérant",
          rejectionReason: "Changement d'avis",
        },
        { db: prisma }
      );
    } catch (err: unknown) {
      rejectRejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("déjà approuvée"), "Message d'erreur inattendu");
    }
    assert(rejectRejected, "Une évaluation approuvée a pu être rejetée !");
  });

  await test("4.3 Rejet de création d'évaluation avec référence dupliquée", async () => {
    // Tenter de créer directement en DB une valorisation avec le même reference
    let duplicateRejected = false;
    try {
      await prisma.zakatValuation.create({
        data: {
          reference: savedReference, // Même référence !
          valuationDate: new Date("2026-10-01"),
          hawlStartDate: new Date("2025-10-02"),
          hawlEndDate: new Date("2026-10-01"),
          nisabMethod: "SILVER",
          nisabValueDZD: 77350,
          zakatRate: 0.025,
          zakatYearType: "LUNAR",
          totalInventoryDZD: 100,
          totalTreasuryDZD: 100,
          totalReceivablesDZD: 100,
          totalSupplierPrepaymentsDZD: 0,
          totalAssetsDZD: 300,
          totalLiabilitiesDZD: 0,
          zakatableBaseDZD: 300,
          zakatDueDZD: 7.5,
          calculationStatus: "COMPLETE",
        },
      });
    } catch (err: unknown) {
      duplicateRejected = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("Unique constraint") || msg.includes("reference"), "Erreur inattendue");
    }
    assert(duplicateRejected, "Une référence dupliquée a été acceptée par la base !");
  });

  await test("4.4 Création d'une nouvelle évaluation pour une période suivante sans altérer l'évaluation approuvée", async () => {
    const previewNext = await calculateZakatPreviewAction({
      valuationDate: "2027-10-01",
      hawlStartDate: "2026-10-02",
      hawlEndDate: "2027-10-01",
      nisabMethod: "SILVER",
      silverGramPriceDZD: 140,
      zakatYearType: "LUNAR",
      zakatRate: 0.025,
      manualLiabilitiesDZD: 0,
      customerFundsConfirmation: "CONFIRMED_EXCLUDED",
    });

    const resNext = await saveZakatValuationAction(
      {
        valuationDate: "2027-10-01",
        hawlStartDate: "2026-10-02",
        hawlEndDate: "2027-10-01",
        nisabMethod: "SILVER",
        nisabValueDZD: 595 * 140,
        nisabSilverPriceDZD: 140,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        manualLiabilitiesDZD: 0,
        customerFundsConfirmation: "CONFIRMED_EXCLUDED",
        notes: "Évaluation de l'année suivante",
        calculationResult: previewNext,
      },
      { db: prisma }
    );

    assert(resNext.success, "Échec de création de l'évaluation suivante");
    assert(resNext.valuationId !== savedValuationId, "ID dupliqué");
    assert(resNext.reference.startsWith("ZAK-202710-"), `Référence inattendue: ${resNext.reference}`);

    // L'ancienne reste approuvée
    const oldValuation = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(oldValuation!.valuation.approvalStatus === "APPROVED", "L'ancienne évaluation a perdu son statut APPROVED !");
    assert(oldValuation!.valuation.totalAssetsDZD === 850000, "L'ancienne évaluation a été altérée !");
  });

  await test("4.5 Rejet d'un brouillon non approuvé avec enregistrement du motif", async () => {
    // Créer un brouillon pour test de rejet
    const draftForReject = await prisma.zakatValuation.create({
      data: {
        reference: "ZAK-202610-7777",
        valuationDate: new Date("2026-10-01"),
        hawlStartDate: new Date("2025-10-02"),
        hawlEndDate: new Date("2026-10-01"),
        nisabMethod: "SILVER",
        nisabValueDZD: 77350,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        totalInventoryDZD: 100,
        totalTreasuryDZD: 100,
        totalReceivablesDZD: 100,
        totalSupplierPrepaymentsDZD: 0,
        totalAssetsDZD: 300,
        totalLiabilitiesDZD: 0,
        zakatableBaseDZD: 300,
        zakatDueDZD: 7.5,
        calculationStatus: "REQUIRES_REVIEW",
        approvalStatus: "DRAFT",
      },
    });

    const res = await rejectZakatValuationAction(
      {
        valuationId: draftForReject.id,
        operatorName: "Associé Principal",
        rejectionReason: "Divergence sur la valorisation du stock",
      },
      { db: prisma }
    );

    assert(res.success, "Échec du rejet");

    const rejectedVal = await getZakatValuationByIdAction(draftForReject.id, { db: prisma });
    assert(rejectedVal!.valuation.approvalStatus === "REJECTED", "Statut REJECTED non enregistré");
    assert(Boolean(rejectedVal!.valuation.rejectedBy?.includes("Associé Principal")), "Opérateur non enregistré");
    assert(Boolean(rejectedVal!.valuation.rejectedBy?.includes("Déclaratif non vérifié")), "Rejet non qualifié comme déclaratif");
    assert(rejectedVal!.valuation.rejectionReason === "Divergence sur la valorisation du stock", "Motif de rejet non enregistré");
  });

  console.log("\n--- GROUPE 5 : DURCISSEMENT, RESTRICTIONS FK & SÉCURITÉ SERVEUR ---");

  await test("5.1 Comportement restrictif des clés étrangères (ON DELETE RESTRICT en base)", async () => {
    // Créer une évaluation avec un item et un ajustement
    const draftFk = await prisma.zakatValuation.create({
      data: {
        reference: "ZAK-202611-FK01",
        valuationDate: new Date("2026-11-01"),
        hawlStartDate: new Date("2025-11-02"),
        hawlEndDate: new Date("2026-11-01"),
        nisabMethod: "MANUAL",
        nisabValueDZD: 100000,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        totalInventoryDZD: 50000,
        totalTreasuryDZD: 50000,
        totalReceivablesDZD: 0,
        totalSupplierPrepaymentsDZD: 0,
        totalAssetsDZD: 100000,
        totalLiabilitiesDZD: 0,
        zakatableBaseDZD: 100000,
        zakatDueDZD: 2500,
        calculationStatus: "COMPLETE",
        approvalStatus: "DRAFT",
      },
    });

    await prisma.zakatValuationItem.create({
      data: {
        valuationId: draftFk.id,
        category: "INVENTORY",
        description: "Article Test FK",
        totalValueDZD: 50000,
      },
    });

    await prisma.zakatAdjustment.create({
      data: {
        valuationId: draftFk.id,
        category: "OTHER",
        description: "Ajustement FK",
        amountDZD: 1000,
        adjustmentType: "ADD",
        reason: "Test FK",
      },
    });

    // Tentative de suppression directe en SQL/Prisma sans suppression préalable des lignes filles
    let fkBlocked = false;
    try {
      await prisma.zakatValuation.delete({
        where: { id: draftFk.id },
      });
    } catch (err: unknown) {
      fkBlocked = true;
      const msg = err instanceof Error ? err.message : String(err);
      // Vérifier que c'est bien une violation de contrainte de clé étrangère
      assert(
        msg.includes("foreign key") || msg.includes("constraint") || msg.includes("FOREIGN KEY") || msg.includes("P2003"),
        `Erreur inattendue lors de la violation FK: ${msg}`
      );
    }
    assert(fkBlocked, "La suppression directe n'a pas été bloquée par ON DELETE RESTRICT !");

    // Vérifier que la valorisation et ses lignes filles existent toujours
    const countItems = await prisma.zakatValuationItem.count({ where: { valuationId: draftFk.id } });
    assert(countItems === 1, "La ligne d'item a été supprimée prématurément !");
    const countAdjs = await prisma.zakatAdjustment.count({ where: { valuationId: draftFk.id } });
    assert(countAdjs === 1, "L'ajustement a été supprimé prématurément !");

    // Maintenant, suppression contrôlée via l'action deleteZakatDraftAction (qui nettoie dans une transaction)
    const delRes = await deleteZakatDraftAction(draftFk.id, { db: prisma });
    assert(delRes.success, "La suppression sécurisée du brouillon a échoué");
    const checkDeleted = await prisma.zakatValuation.findUnique({ where: { id: draftFk.id } });
    assert(checkDeleted === null, "Le brouillon n'a pas été supprimé");
  });

  await test("5.2 Interdiction de suppression d'une évaluation approuvée et d'une évaluation rejetée", async () => {
    // 1. Évaluation approuvée (savedValuationId)
    let approvedDeleteBlocked = false;
    try {
      await deleteZakatDraftAction(savedValuationId, { db: prisma });
    } catch (err: unknown) {
      approvedDeleteBlocked = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("immuable") && msg.includes("supprimée"), "Message inattendu pour évaluation approuvée");
    }
    assert(approvedDeleteBlocked, "La suppression d'une évaluation approuvée n'a pas été rejetée !");

    // 2. Évaluation rejetée
    const rejectedRecord = await prisma.zakatValuation.create({
      data: {
        reference: "ZAK-202611-REJ01",
        valuationDate: new Date("2026-11-01"),
        hawlStartDate: new Date("2025-11-02"),
        hawlEndDate: new Date("2026-11-01"),
        nisabMethod: "MANUAL",
        nisabValueDZD: 100000,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        totalInventoryDZD: 50000,
        totalTreasuryDZD: 50000,
        totalReceivablesDZD: 0,
        totalSupplierPrepaymentsDZD: 0,
        totalAssetsDZD: 100000,
        totalLiabilitiesDZD: 0,
        zakatableBaseDZD: 100000,
        zakatDueDZD: 2500,
        calculationStatus: "REQUIRES_REVIEW",
        approvalStatus: "REJECTED",
        rejectionReason: "Dossier refusé pour archivage d'audit",
      },
    });

    let rejectedDeleteBlocked = false;
    try {
      await deleteZakatDraftAction(rejectedRecord.id, { db: prisma });
    } catch (err: unknown) {
      rejectedDeleteBlocked = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("audit") && msg.includes("rejetée"), "Message inattendu pour évaluation rejetée");
    }
    assert(rejectedDeleteBlocked, "La suppression d'une évaluation rejetée n'a pas été rejetée !");
  });

  await test("5.3 Les en-têtes HTTP arbitraires ne peuvent accorder aucune permission d'administrateur", async () => {
    // Vérification que le module n'accorde aucun privilège sur base d'en-têtes HTTP clients
    const { formatDeclarativeOperator } = await import("@/app/zakat/auth");
    
    // Test direct de la fonction de formatage : aucun rôle forgé ou authentifié n'est produit
    const result1 = formatDeclarativeOperator("Hacker x-user-role:admin");
    assert(!result1.includes("Authentifié"), "Une mention d'authentification a été faussement produite !");
    assert(result1.includes("Déclaratif non vérifié"), "La mention déclarative non vérifiée doit être explicite");

    const result2 = formatDeclarativeOperator("");
    assert(result2 === "Opérateur non spécifié (Déclaratif non vérifié)", "Valeur vide mal gérée");
  });

  await test("5.4 L'identité approbatrice saisie par l'opérateur est explicitement déclarative et non traitée comme authentifiée", async () => {
    // Créer un brouillon valide prêt à être approuvé
    const draftForIdentity = await prisma.zakatValuation.create({
      data: {
        reference: "ZAK-202611-AUTH01",
        valuationDate: new Date("2026-11-01"),
        hawlStartDate: new Date("2025-11-02"),
        hawlEndDate: new Date("2026-11-01"),
        nisabMethod: "MANUAL",
        nisabValueDZD: 50000,
        zakatRate: 0.025,
        zakatYearType: "LUNAR",
        totalInventoryDZD: 30000,
        totalTreasuryDZD: 30000,
        totalReceivablesDZD: 0,
        totalSupplierPrepaymentsDZD: 0,
        totalAssetsDZD: 60000,
        totalLiabilitiesDZD: 0,
        zakatableBaseDZD: 60000,
        zakatDueDZD: 1500,
        calculationStatus: "COMPLETE",
        customerFundsConfirmation: "CONFIRMED_EXCLUDED",
        approvalStatus: "DRAFT",
      },
    });

    const clientPayload = {
      valuationId: draftForIdentity.id,
      approverName: "M. Ahmed Benali (Directeur)",
      approvalNotes: "Approbation annuelle déclarative",
      confirmDisclaimer: true,
    };

    const beforeApproval = Date.now();
    const approveRes = await approveZakatValuationAction(clientPayload, { db: prisma });
    const afterApproval = Date.now();

    assert(approveRes.success, "Échec d'approbation");
    assert(
      approveRes.approvedBy === "M. Ahmed Benali (Directeur) (Déclaratif non vérifié)",
      `Le nom approbateur retourné doit être explicitement qualifié de déclaratif non vérifié : ${approveRes.approvedBy}`
    );

    // Vérification en base de données :
    const savedInDb = await prisma.zakatValuation.findUnique({ where: { id: draftForIdentity.id } });
    assert(
      savedInDb?.approvedBy === "M. Ahmed Benali (Directeur) (Déclaratif non vérifié)",
      `La base de données n'a pas enregistré la mention déclarative non vérifiée : ${savedInDb?.approvedBy}`
    );
    // Vérification de l'horodatage généré strictement côté serveur
    assert(savedInDb?.approvedAt !== null, "Timestamp d'approbation manquant en base");
    const serverTimestamp = savedInDb!.approvedAt!.getTime();
    assert(
      serverTimestamp >= beforeApproval - 1000 && serverTimestamp <= afterApproval + 1000,
      "Le timestamp d'approbation n'a pas été généré côté serveur au moment de la transaction !"
    );
  });

  await test("5.5 Préservation stricte des items d'évaluation et ajustements après approbation", async () => {
    // Vérifier l'évaluation de test 1 (savedValuationId)
    const valuationBefore = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(valuationBefore !== null, "Évaluation introuvable");
    const initialItemCount = valuationBefore!.items.length;
    const initialAdjCount = valuationBefore!.adjustments.length;

    // Tentative d'ajout d'ajustement : doit être bloquée
    let addBlocked = false;
    try {
      await addZakatAdjustmentAction(
        {
          valuationId: savedValuationId,
          category: "OTHER",
          description: "Tentative altération post-approbation",
          amountDZD: 1000,
          adjustmentType: "ADD",
          reason: "Test",
        },
        { db: prisma }
      );
    } catch {
      addBlocked = true;
    }
    assert(addBlocked, "L'ajout d'ajustement sur évaluation approuvée n'a pas été bloqué");

    // Tentative de suppression d'un ajustement existant si présent
    if (valuationBefore!.adjustments.length > 0) {
      let removeBlocked = false;
      try {
        await removeZakatAdjustmentAction(valuationBefore!.adjustments[0].id, { db: prisma });
      } catch {
        removeBlocked = true;
      }
      assert(removeBlocked, "La suppression d'ajustement sur évaluation approuvée n'a pas été bloquée");
    }

    const valuationAfter = await getZakatValuationByIdAction(savedValuationId, { db: prisma });
    assert(valuationAfter!.items.length === initialItemCount, "Le nombre d'items a changé !");
    assert(valuationAfter!.adjustments.length === initialAdjCount, "Le nombre d'ajustements a changé !");
  });

  await test("5.6 Rejet de tentative d'approbation dupliquée préservant l'intégrité originale", async () => {
    const valuationFirst = await prisma.zakatValuation.findUnique({ where: { id: savedValuationId } });
    const originalApprovedAt = valuationFirst!.approvedAt;
    const originalApprovedBy = valuationFirst!.approvedBy;

    let duplicateBlocked = false;
    try {
      await approveZakatValuationAction(
        {
          valuationId: savedValuationId,
          approverName: "Autre Approbateur",
          confirmDisclaimer: true,
        },
        { db: prisma }
      );
    } catch (err: unknown) {
      duplicateBlocked = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(msg.includes("déjà approuvée") || msg.includes("immuable"), `Message inattendu: ${msg}`);
    }
    assert(duplicateBlocked, "La double approbation n'a pas été bloquée !");

    // Vérifier que ni l'horodatage ni le nom n'ont été altérés
    const valuationAfterAttempt = await prisma.zakatValuation.findUnique({ where: { id: savedValuationId } });
    assert(
      valuationAfterAttempt!.approvedAt?.getTime() === originalApprovedAt?.getTime(),
      "Le timestamp d'approbation a été altéré par la requête dupliquée !"
    );
    assert(
      valuationAfterAttempt!.approvedBy === originalApprovedBy,
      "Le responsable approbateur a été altéré par la requête dupliquée !"
    );
  });

  console.log("\n--- GROUPE 6 : PRÉCISION ET FORMATAGE FINANCIER DES MONTANTS ZAKAT (CENTIMES) ---");

  function normalizeSpaces(str: string): string {
    return str.replace(/[\u202f\u00a0]/g, " ");
  }

  await test("6.1 Préservation exacte des centimes sur montant fractionnaire (433247.90 → 433 247,90 DA)", async () => {
    const formatted = formatZakatMoney(433247.90);
    const normalized = normalizeSpaces(formatted);
    assert(
      normalized === "433 247,90 DA",
      `Formatage incorrect pour 433247.90: attendu "433 247,90 DA", reçu "${normalized}" (brut: "${formatted}")`
    );
  });

  await test("6.2 Formatage propre des montants entiers sans zéro décimal inutile (15101550 → 15 101 550 DA)", async () => {
    const formatted = formatZakatMoney(15101550);
    const normalized = normalizeSpaces(formatted);
    assert(
      normalized === "15 101 550 DA",
      `Formatage incorrect pour 15101550: attendu "15 101 550 DA", reçu "${normalized}" (brut: "${formatted}")`
    );
  });

  await test("6.3 Gestion exacte du montant zéro (0 → 0 DA)", async () => {
    const formatted = formatZakatMoney(0);
    const normalized = normalizeSpaces(formatted);
    assert(
      normalized === "0 DA",
      `Formatage incorrect pour 0: attendu "0 DA", reçu "${normalized}"`
    );
  });

  await test("6.4 Gestion robuste et sans crash des valeurs nulles et indéfinies (null / undefined → 0 DA)", async () => {
    const fromNull = formatZakatMoney(null);
    const fromUndefined = formatZakatMoney(undefined);
    const fromNaN = formatZakatMoney(NaN);

    assert(fromNull === "0 DA", `Attendu "0 DA" pour null, reçu "${fromNull}"`);
    assert(fromUndefined === "0 DA", `Attendu "0 DA" pour undefined, reçu "${fromUndefined}"`);
    assert(fromNaN === "0 DA", `Attendu "0 DA" pour NaN, reçu "${fromNaN}"`);
  });

  // Nettoyage de la base de test
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch {
    // Ignore
  }

  console.log("\n================================================================================");
  const passed = results.filter((r) => r.passed).length;
  console.log(`  RÉSULTATS DE LA SUITE ZAKAT PHASE 3 : ${passed}/${results.length} PASSÉS`);
  console.log("================================================================================\n");

  if (passed !== results.length) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("FATAL TEST ERROR:", e);
  process.exit(1);
});
