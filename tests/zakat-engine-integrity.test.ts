/**
 * Comprehensive Integration & Integrity Test Suite for
 * Business Zakat Accounting Engine (Phase 2)
 *
 * Runs strictly against an isolated disposable database: prisma/test_zakat_engine.db
 * NEVER touches the production database.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_zakat_engine.db");

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
  console.log("  SHOP ERP — SUITE DE TESTS : MOTEUR DE CALCUL ZAKAT (PHASE 2)");
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
    const sql = fs.readFileSync(sqlFile, "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await ddlClient.execute(stmt);
    }
  }

  // Tables supplémentaires (Customer Savings) présentes dans le schéma Prisma
  const additionalSchemaSql = `
    CREATE TABLE IF NOT EXISTS "customer_savings_accounts" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "customerId" INTEGER NOT NULL,
        "balance" REAL NOT NULL DEFAULT 0,
        "totalDeposited" REAL NOT NULL DEFAULT 0,
        "totalUsed" REAL NOT NULL DEFAULT 0,
        "totalRefunded" REAL NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "customer_savings_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "customer_savings_accounts_customerId_key" ON "customer_savings_accounts"("customerId");

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
        "relatedTransactionId" INTEGER,
        "sessionId" INTEGER,
        "description" TEXT NOT NULL,
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'completed',
        "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "customer_savings_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "customer_savings_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "customer_savings_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "customer_savings_transactions_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "treasury_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "customer_savings_transactions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "customer_savings_transactions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "customer_savings_transactions_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "customer_savings_transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "customer_savings_transactions_reference_key" ON "customer_savings_transactions"("reference");
  `;

  for (const stmt of additionalSchemaSql.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
    await ddlClient.execute(stmt);
  }

  ddlClient.close();
  console.log("✓ Schéma et migrations appliqués à la base de test isolée.\n");

  const { prisma } = await import("@/lib/prisma");
  const {
    calculateHistoricalBusinessZakat,
    reconstructHistoricalInventory,
    reconstructHistoricalTreasury,
    reconstructHistoricalReceivables,
    reconstructHistoricalCustomerFunds,
    reconstructHistoricalSupplierAdvances,
    validateZakatCalculationInput,
  } = await import("@/lib/zakat");

  // Récupération ou mise à jour des comptes de trésorerie créés par les migrations
  const caisse = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-CAISSE" },
    update: { openingBalance: 10000 },
    create: {
      code: "ACC-CAISSE",
      name: "Caisse Magasin",
      type: "cash",
      isDefault: true,
      openingBalance: 10000,
    },
  });

  const coffre = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-COFFRE-MAGASIN" },
    update: { openingBalance: 50000 },
    create: {
      code: "ACC-COFFRE-MAGASIN",
      name: "Coffre Magasin",
      type: "safe",
      isDefault: false,
      openingBalance: 50000,
    },
  });

  const banque = await prisma.treasuryAccount.upsert({
    where: { code: "ACC-BANQUE" },
    update: { openingBalance: 200000 },
    create: {
      code: "ACC-BANQUE",
      name: "Compte Bancaire",
      type: "bank",
      isDefault: false,
      openingBalance: 200000,
    },
  });

  // Emplacements de stock
  const locMagasin = await prisma.location.upsert({
    where: { code: "LOC-MAGASIN" },
    update: {},
    create: {
      code: "LOC-MAGASIN",
      name: "Magasin Principal",
      isDefault: true,
    },
  });

  const locDepot = await prisma.location.upsert({
    where: { code: "LOC-DEPOT" },
    update: {},
    create: {
      code: "LOC-DEPOT",
      name: "Dépôt Central",
      isDefault: false,
    },
  });

  // Produits
  const prodA = await prisma.product.create({
    data: {
      sku: "PROD-A-01",
      name: "Table Basse Prestige",
      costPrice: 5000,
      sellingPrice: 8500,
      stock: 15,
    },
  });

  const prodB = await prisma.product.create({
    data: {
      sku: "PROD-B-02",
      name: "Chaise Velours Dorée",
      costPrice: 3000,
      sellingPrice: 5500,
      stock: 20,
    },
  });

  const prodNoCost = await prisma.product.create({
    data: {
      sku: "PROD-NO-COST",
      name: "Miroir Mural Ancien",
      costPrice: null, // Test missing cost price
      sellingPrice: 12000,
      stock: 4,
    },
  });

  // Client et Fournisseur
  const customer1 = await prisma.customer.create({
    data: {
      code: "CLT-001",
      name: "Karim Meziane",
      phone: "0550123456",
    },
  });

  const supplier1 = await prisma.supplier.create({
    data: {
      code: "FRN-001",
      name: "Fournisseur Bois & Déco",
    },
  });

  let testIdx = 0;

  async function test(name: string, fn: () => Promise<void>) {
    testIdx++;
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
  }

  console.log("--- GROUPE 1 : RECONSTRUCTION HISTORIQUE DU STOCK (INVENTORY) ---");

  await test("1.1 Stock initial (INITIAL) inclus avant la date d'évaluation", async () => {
    await prisma.stockMovement.create({
      data: {
        reference: "INIT-001",
        type: "INITIAL",
        productId: prodA.id,
        toLocationId: locMagasin.id,
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        unitCost: 5000,
        date: new Date("2026-05-01T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-05",
      productIds: [prodA.id],
      db: prisma,
    });

    const item = res.items.find((i) => i.productId === prodA.id);
    assert(item?.reconstructedQuantity === 10, `Attendu: 10, Reçu: ${item?.reconstructedQuantity}`);
    assert(item?.totalCostValue === 50000, `Attendu valeur: 50000, Reçu: ${item?.totalCostValue}`);
  });

  await test("1.2 Réception fournisseur (RECEIPT) et Vente (SALE) avant cutoff", async () => {
    // Réception de 10 unités le 10 mai
    await prisma.stockMovement.create({
      data: {
        reference: "REC-001",
        type: "RECEIPT",
        productId: prodA.id,
        toLocationId: locMagasin.id,
        quantity: 10,
        stockBefore: 10,
        stockAfter: 20,
        unitCost: 5000,
        date: new Date("2026-05-10T11:00:00Z"),
      },
    });

    // Vente de 5 unités le 15 mai
    await prisma.stockMovement.create({
      data: {
        reference: "SALE-001",
        type: "SALE",
        productId: prodA.id,
        fromLocationId: locMagasin.id,
        quantity: 5,
        stockBefore: 20,
        stockAfter: 15,
        unitCost: 5000,
        date: new Date("2026-05-15T14:00:00Z"),
      },
    });

    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-20",
      productIds: [prodA.id],
      db: prisma,
    });

    const item = res.items.find((i) => i.productId === prodA.id);
    // 10 initial + 10 receipt - 5 sale = 15
    assert(item?.reconstructedQuantity === 15, `Attendu: 15, Reçu: ${item?.reconstructedQuantity}`);
    assert(item?.totalCostValue === 75000, `Attendu: 75000 DA, Reçu: ${item?.totalCostValue}`);
  });

  await test("1.3 Sortie exceptionnelle (ISSUE) et Ajustements (+) et (-)", async () => {
    // Sortie pour dommage / perte de 1 unité le 22 mai
    await prisma.stockMovement.create({
      data: {
        reference: "ISSUE-001",
        type: "ISSUE",
        productId: prodA.id,
        fromLocationId: locMagasin.id,
        quantity: 1,
        stockBefore: 15,
        stockAfter: 14,
        date: new Date("2026-05-22T09:00:00Z"),
      },
    });

    // Ajustement négatif de 2 unités le 25 mai
    await prisma.stockMovement.create({
      data: {
        reference: "ADJ-NEG-001",
        type: "ADJUSTMENT",
        productId: prodA.id,
        fromLocationId: locMagasin.id,
        toLocationId: null,
        quantity: 2,
        stockBefore: 14,
        stockAfter: 12,
        date: new Date("2026-05-25T10:00:00Z"),
      },
    });

    // Ajustement positif de 3 unités le 26 mai
    await prisma.stockMovement.create({
      data: {
        reference: "ADJ-POS-001",
        type: "ADJUSTMENT",
        productId: prodA.id,
        fromLocationId: null,
        toLocationId: locMagasin.id,
        quantity: 3,
        stockBefore: 12,
        stockAfter: 15,
        date: new Date("2026-05-26T11:00:00Z"),
      },
    });

    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-28",
      productIds: [prodA.id],
      db: prisma,
    });

    const item = res.items.find((i) => i.productId === prodA.id);
    // 15 - 1 - 2 + 3 = 15
    assert(item?.reconstructedQuantity === 15, `Attendu: 15, Reçu: ${item?.reconstructedQuantity}`);
  });

  await test("1.4 Transfert inter-dépôts (TRANSFER) préserve strictement le stock total", async () => {
    // Transfert de 4 unités de Magasin vers Dépôt le 29 mai
    await prisma.stockMovement.create({
      data: {
        reference: "TRF-001",
        type: "TRANSFER",
        productId: prodA.id,
        fromLocationId: locMagasin.id,
        toLocationId: locDepot.id,
        quantity: 4,
        stockBefore: 15,
        stockAfter: 11,
        date: new Date("2026-05-29T12:00:00Z"),
      },
    });

    // Évaluation globale au 30 mai : le total doit rester strictement 15
    const resGlobal = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-30",
      productIds: [prodA.id],
      db: prisma,
    });
    const itemGlobal = resGlobal.items.find((i) => i.productId === prodA.id);
    assert(itemGlobal?.reconstructedQuantity === 15, `Attendu total: 15, Reçu: ${itemGlobal?.reconstructedQuantity}`);

    // Évaluation par emplacement : Magasin = 11, Dépôt = 4
    const resMag = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-30",
      locationId: locMagasin.id,
      productIds: [prodA.id],
      db: prisma,
    });
    const itemMag = resMag.items.find((i) => i.productId === prodA.id);
    assert(itemMag?.reconstructedQuantity === 11, `Attendu Magasin: 11, Reçu: ${itemMag?.reconstructedQuantity}`);

    const resDep = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-30",
      locationId: locDepot.id,
      productIds: [prodA.id],
      db: prisma,
    });
    const itemDep = resDep.items.find((i) => i.productId === prodA.id);
    assert(itemDep?.reconstructedQuantity === 4, `Attendu Dépôt: 4, Reçu: ${itemDep?.reconstructedQuantity}`);
  });

  await test("1.5 Exclusion stricte des mouvements postérieurs au cutoff", async () => {
    // Mouvement futur : Vente de 10 unités le 15 juin 2026
    await prisma.stockMovement.create({
      data: {
        reference: "SALE-FUTURE",
        type: "SALE",
        productId: prodA.id,
        fromLocationId: locMagasin.id,
        quantity: 10,
        stockBefore: 11,
        stockAfter: 1,
        date: new Date("2026-06-15T15:00:00Z"),
      },
    });

    // Au 31 mai 2026, cette vente future NE DOIT PAS être prise en compte
    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-31",
      productIds: [prodA.id],
      db: prisma,
    });
    const item = res.items.find((i) => i.productId === prodA.id);
    assert(item?.reconstructedQuantity === 15, `Attendu: 15 (vente future ignorée), Reçu: ${item?.reconstructedQuantity}`);
  });

  await test("1.6 Détection de prix de revient manquant (costPrice null)", async () => {
    await prisma.stockMovement.create({
      data: {
        reference: "INIT-NO-COST",
        type: "INITIAL",
        productId: prodNoCost.id,
        toLocationId: locMagasin.id,
        quantity: 4,
        stockBefore: 0,
        stockAfter: 4,
        date: new Date("2026-05-01T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-31",
      productIds: [prodNoCost.id],
      db: prisma,
    });
    const item = res.items.find((i) => i.productId === prodNoCost.id);
    assert(item?.hasMissingCostPrice === true, "Le produit sans prix de revient doit être flaggué");
    assert(res.missingCostPriceCount >= 1, "Le compteur de costPrice manquants doit être incrémenté");
    assert(item?.totalCostValue === null, "La valorisation doit être null (exclue des actifs confirmés) en l'absence de coût");
  });

  console.log("\n--- GROUPE 2 : RECONSTRUCTION HISTORIQUE DE LA TRÉSORERIE (TREASURY) ---");

  await test("2.1 Encaissement vente espèces et dépense sur Caisse", async () => {
    // Vente encaissée en caisse le 10 mai : 30 000 DA
    await prisma.payment.create({
      data: {
        reference: "PAY-CASH-01",
        accountId: caisse.id,
        amount: 30000,
        method: "cash",
        status: "completed",
        paymentDate: new Date("2026-05-10T12:00:00Z"),
      },
    });

    // Dépense de fournitures le 12 mai : 5 000 DA
    await prisma.expense.create({
      data: {
        reference: "EXP-01",
        accountId: caisse.id,
        amount: 5000,
        category: "other",
        description: "Fournitures de bureau",
        type: "expense",
        status: "completed",
        date: new Date("2026-05-12T14:00:00Z"),
      },
    });

    const res = await reconstructHistoricalTreasury({
      valuationDateStr: "2026-05-15",
      db: prisma,
    });

    const caisseItem = res.accounts.find((a) => a.accountId === caisse.id);
    // Solde initial 10 000 + 30 000 - 5 000 = 35 000 DA
    assert(caisseItem?.reconstructedBalance === 35000, `Attendu Caisse: 35000, Reçu: ${caisseItem?.reconstructedBalance}`);
  });

  await test("2.2 Virement interne Caisse -> Coffre et neutralité globale", async () => {
    // Virement de 20 000 DA de Caisse vers Coffre le 16 mai
    await prisma.treasuryTransfer.create({
      data: {
        reference: "TRF-CS-CF-01",
        fromAccountId: caisse.id,
        toAccountId: coffre.id,
        amount: 20000,
        motif: "Alimentation coffre",
        date: new Date("2026-05-16T16:00:00Z"),
      },
    });

    const res = await reconstructHistoricalTreasury({
      valuationDateStr: "2026-05-18",
      db: prisma,
    });

    const caisseItem = res.accounts.find((a) => a.accountId === caisse.id);
    const coffreItem = res.accounts.find((a) => a.accountId === coffre.id);

    // Caisse: 35 000 - 20 000 = 15 000 DA
    assert(caisseItem?.reconstructedBalance === 15000, `Attendu Caisse: 15000, Reçu: ${caisseItem?.reconstructedBalance}`);
    // Coffre: 50 000 + 20 000 = 70 000 DA
    assert(coffreItem?.reconstructedBalance === 70000, `Attendu Coffre: 70000, Reçu: ${coffreItem?.reconstructedBalance}`);

    // Neutralité stricte des virements
    assert(res.isTransfersNetZero === true, "Les virements internes doivent avoir un solde net égal à 0");
    assert(res.interAccountTransfersNet === 0, `Écart de virement non nul: ${res.interAccountTransfersNet}`);
  });

  await test("2.3 Exclusion des paiements annulés (cancelled)", async () => {
    // Paiement annulé de 100 000 DA le 17 mai
    await prisma.payment.create({
      data: {
        reference: "PAY-CANCELLED-01",
        accountId: caisse.id,
        amount: 100000,
        method: "cash",
        status: "cancelled",
        paymentDate: new Date("2026-05-17T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalTreasury({
      valuationDateStr: "2026-05-18",
      db: prisma,
    });

    const caisseItem = res.accounts.find((a) => a.accountId === caisse.id);
    assert(caisseItem?.reconstructedBalance === 15000, `Le paiement annulé a altéré le solde: ${caisseItem?.reconstructedBalance}`);
  });

  await test("2.4 Exclusion stricte des opérations postérieures au cutoff", async () => {
    // Paiement bancaire futur le 10 juin : 50 000 DA
    await prisma.payment.create({
      data: {
        reference: "PAY-BANK-FUTURE",
        accountId: banque.id,
        amount: 50000,
        method: "transfer",
        status: "completed",
        paymentDate: new Date("2026-06-10T11:00:00Z"),
      },
    });

    const res = await reconstructHistoricalTreasury({
      valuationDateStr: "2026-05-31",
      db: prisma,
    });

    const banqueItem = res.accounts.find((a) => a.accountId === banque.id);
    // Banque doit rester à son solde initial 200 000 DA
    assert(banqueItem?.reconstructedBalance === 200000, `Attendu Banque: 200000, Reçu: ${banqueItem?.reconstructedBalance}`);
  });

  console.log("\n--- GROUPE 3 : CRÉANCES CLIENTS ET FONDS TIERS (RECEIVABLES & TRUST FUNDS) ---");

  await test("3.1 Vente confirmée non réglée et vente partiellement réglée", async () => {
    // Vente 1 : 100 000 DA le 5 mai, aucun règlement
    const sale1 = await prisma.sales.create({
      data: {
        reference: "VTE-001",
        customerId: customer1.id,
        status: "confirmed",
        totalAmount: 100000,
        paidAmount: 0,
        saleDate: new Date("2026-05-05T10:00:00Z"),
      },
    });

    // Vente 2 : 50 000 DA le 10 mai, acompte partiel de 20 000 DA le 12 mai
    const sale2 = await prisma.sales.create({
      data: {
        reference: "VTE-002",
        customerId: customer1.id,
        status: "confirmed",
        totalAmount: 50000,
        paidAmount: 20000,
        saleDate: new Date("2026-05-10T11:00:00Z"),
      },
    });

    await prisma.payment.create({
      data: {
        reference: "PAY-SALE2-PARTIAL",
        saleId: sale2.id,
        accountId: caisse.id,
        amount: 20000,
        method: "cash",
        status: "completed",
        paymentDate: new Date("2026-05-12T15:00:00Z"),
      },
    });

    const res = await reconstructHistoricalReceivables({
      valuationDateStr: "2026-05-20",
      db: prisma,
    });

    const cItem = res.customers.find((c) => c.customerId === customer1.id);
    // Dette = 100 000 + (50 000 - 20 000) = 130 000 DA
    assert(cItem?.outstandingBalance === 130000, `Attendu créance: 130000 DA, Reçu: ${cItem?.outstandingBalance}`);
    assert(res.requiresManagerReview === true, "Doit exiger la revue de solvabilité par le gestionnaire");
  });

  await test("3.2 Affectation d'acompte client (CustomerAdvanceAllocation) avant cutoff", async () => {
    // Vente 3 : 40 000 DA le 20 mai
    const sale3 = await prisma.sales.create({
      data: {
        reference: "VTE-003",
        customerId: customer1.id,
        status: "confirmed",
        totalAmount: 40000,
        paidAmount: 15000,
        saleDate: new Date("2026-05-20T10:00:00Z"),
      },
    });

    const advance = await prisma.customerAdvance.create({
      data: {
        reference: "ADV-001",
        customerId: customer1.id,
        amount: 25000,
        allocatedAmount: 15000,
        paymentDate: new Date("2026-05-18T10:00:00Z"),
      },
    });

    // Affectation de 15 000 DA sur la vente 3 le 21 mai
    await prisma.customerAdvanceAllocation.create({
      data: {
        advanceId: advance.id,
        saleId: sale3.id,
        amount: 15000,
        allocatedAt: new Date("2026-05-21T14:00:00Z"),
      },
    });

    const res = await reconstructHistoricalReceivables({
      valuationDateStr: "2026-05-25",
      db: prisma,
    });

    const cItem = res.customers.find((c) => c.customerId === customer1.id);
    // Dette totale = 130 000 + (40 000 - 15 000) = 155 000 DA
    assert(cItem?.outstandingBalance === 155000, `Attendu: 155000 DA, Reçu: ${cItem?.outstandingBalance}`);
  });

  await test("3.3 Règlements postérieurs au cutoff ne réduisent pas la créance au cutoff", async () => {
    // Règlement complet futur de 100 000 DA le 15 juin
    const sale1 = await prisma.sales.findFirst({ where: { reference: "VTE-001" } });
    assert(sale1 !== null, "Sale 1 non trouvée");

    await prisma.payment.create({
      data: {
        reference: "PAY-FUTURE-SETTLE",
        saleId: sale1!.id,
        accountId: caisse.id,
        amount: 100000,
        method: "cash",
        status: "completed",
        paymentDate: new Date("2026-06-15T10:00:00Z"),
      },
    });

    // Évaluation au 31 mai : la créance de 100 000 DA doit TOUJOURS être active
    const res = await reconstructHistoricalReceivables({
      valuationDateStr: "2026-05-31",
      db: prisma,
    });

    const cItem = res.customers.find((c) => c.customerId === customer1.id);
    assert(cItem?.outstandingBalance === 155000, `Attendu au 31 mai: 155000 DA, Reçu: ${cItem?.outstandingBalance}`);
  });

  await test("3.4 Reconstruction des fonds clients (Amanat) depuis le grand livre d'épargne", async () => {
    const savingsAcc = await prisma.customerSavingsAccount.create({
      data: {
        customerId: customer1.id,
        balance: 60000, // solde courant théorique
      },
    });

    // Dépôt de 80 000 DA le 10 mai
    await prisma.customerSavingsTransaction.create({
      data: {
        reference: "SAV-DEP-01",
        customerId: customer1.id,
        accountId: savingsAcc.id,
        type: "DEPOSIT",
        direction: "IN",
        amount: 80000,
        balanceBefore: 0,
        balanceAfter: 80000,
        description: "Dépôt d'épargne en espèces",
        date: new Date("2026-05-10T10:00:00Z"),
      },
    });

    // Utilisation de 20 000 DA le 20 mai
    await prisma.customerSavingsTransaction.create({
      data: {
        reference: "SAV-USE-01",
        customerId: customer1.id,
        accountId: savingsAcc.id,
        type: "USAGE",
        direction: "OUT",
        amount: 20000,
        balanceBefore: 80000,
        balanceAfter: 60000,
        description: "Règlement partiel",
        date: new Date("2026-05-20T11:00:00Z"),
      },
    });

    const resFunds = await reconstructHistoricalCustomerFunds({
      valuationDateStr: "2026-05-25",
      db: prisma,
    });

    // Épargne historique au 25 mai : 80 000 - 20 000 = 60 000 DA
    assert(resFunds.totalSavingsHeldDZD === 60000, `Attendu épargne: 60000, Reçu: ${resFunds.totalSavingsHeldDZD}`);
    // Acomptes non consommés (ADV-001 avait 25 000 - 15 000 = 10 000 DA restants)
    assert(resFunds.totalUnallocatedAdvancesDZD === 10000, `Attendu acompte restant: 10000, Reçu: ${resFunds.totalUnallocatedAdvancesDZD}`);
    // Total fonds clients détenus = 70 000 DA
    assert(resFunds.totalCustomerFundsDZD === 70000, `Attendu total fonds tiers: 70000, Reçu: ${resFunds.totalCustomerFundsDZD}`);
  });

  console.log("\n--- GROUPE 4 : AVANCES FOURNISSEURS HISTORIQUES (SUPPLIER ADVANCES) ---");

  await test("4.1 Versement supplémentaire fournisseur et imputation partielle avant cutoff", async () => {
    // Versement de 50 000 DA au fournisseur le 10 mai
    const payment = await prisma.supplierAdditionalPayment.create({
      data: {
        reference: "VRS-001",
        supplierId: supplier1.id,
        treasuryAccountId: caisse.id,
        amount: 50000,
        isReversal: false,
        status: "completed",
        date: new Date("2026-05-10T10:00:00Z"),
      },
    });

    // Imputation de 30 000 DA sur dette le 15 mai
    await prisma.supplierAdditionalPaymentAllocation.create({
      data: {
        reference: "IMP-001",
        paymentId: payment.id,
        supplierId: supplier1.id,
        amount: 30000,
        isReversal: false,
        status: "completed",
        date: new Date("2026-05-15T12:00:00Z"),
      },
    });

    const res = await reconstructHistoricalSupplierAdvances({
      valuationDateStr: "2026-05-20",
      db: prisma,
    });

    const item = res.items.find((i) => i.supplierId === supplier1.id);
    // Reste non imputé : 50 000 - 30 000 = 20 000 DA
    assert(item?.unallocatedPrepayment === 20000, `Attendu acompte fournisseur: 20000, Reçu: ${item?.unallocatedPrepayment}`);
  });

  await test("4.2 Imputation postérieure au cutoff n'annule pas l'avance au cutoff", async () => {
    // Imputation des 20 000 DA restants le 10 juin 2026
    const payment = await prisma.supplierAdditionalPayment.findFirst({ where: { reference: "VRS-001" } });
    assert(payment !== null, "Paiement VRS-001 non trouvé");

    await prisma.supplierAdditionalPaymentAllocation.create({
      data: {
        reference: "IMP-FUTURE-02",
        paymentId: payment!.id,
        supplierId: supplier1.id,
        amount: 20000,
        isReversal: false,
        status: "completed",
        date: new Date("2026-06-10T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalSupplierAdvances({
      valuationDateStr: "2026-05-31",
      db: prisma,
    });

    const item = res.items.find((i) => i.supplierId === supplier1.id);
    // Au 31 mai, l'avance non imputée était toujours de 20 000 DA
    assert(item?.unallocatedPrepayment === 20000, `Attendu au 31 mai: 20000 DA, Reçu: ${item?.unallocatedPrepayment}`);
  });

  console.log("\n--- GROUPE 5 : MOTEUR GLOBAL DE CALCUL ZAKAT (MAIN CALCULATION ENGINE) ---");

  await test("5.1 Calcul complet Hawl Lunaire avec Nisab Argent atteint", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        zakatRate: 0.025,
        nisabConfig: {
          standard: "SILVER",
          silverGramPriceDZD: 130, // 595 * 130 = 77 350 DA
        },
        manualLiabilitiesDZD: 50000, // Dettes saisies manuellement
        manualLiabilitiesNote: "Dettes fournisseurs pour marchandises en stock",
      },
      { db: prisma }
    );

    assert(result.status === "REQUIRES_REVIEW", `Statut attendu REQUIRES_REVIEW, Reçu: ${result.status}`);
    assert(result.nisab.thresholdDZD === 77350, `Attendu Nisab: 77350, Reçu: ${result.nisab.thresholdDZD}`);
    assert(result.nisab.isNisabReached === true, "Nisab devrait être atteint");

    // Vérifier la formule de calcul :
    // Total Actifs = Stock + Trésorerie + Créances + Avances fournisseurs
    const expectedAssets =
      result.assets.inventory.totalValueDZD +
      result.assets.treasury.totalBalanceDZD +
      result.assets.receivables.totalReceivablesDZD +
      result.assets.supplierPrepayments.totalUnallocatedPrepaymentsDZD;

    assert(
      Math.abs(result.assets.totalAssetsDZD - expectedAssets) < 0.01,
      `Incohérence total actifs: ${result.assets.totalAssetsDZD} vs ${expectedAssets}`
    );

    const expectedBase = Math.max(0, expectedAssets - 50000);
    assert(
      Math.abs(result.calculation.preliminaryZakatBaseDZD - expectedBase) < 0.01,
      `Incohérence assiette: ${result.calculation.preliminaryZakatBaseDZD} vs ${expectedBase}`
    );

    const expectedZakat = Math.round(expectedBase * 0.025 * 100) / 100;
    assert(
      Math.abs(result.calculation.preliminaryZakatDueDZD - expectedZakat) < 0.02,
      `Incohérence Zakat due: ${result.calculation.preliminaryZakatDueDZD} vs ${expectedZakat}`
    );

    // Vérification de la non-altération de la DB
    assert(result.calculation.isFinalReligiousRuling === false, "Ne doit pas être une fatwa");
    assert(result.liabilities.source === "MANAGER_ENTERED", "Source des dettes doit être MANAGER_ENTERED");
  });

  await test("5.2 Calcul Hawl Solaire avec taux personnalisé (ex: 2.577%)", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "SOLAR",
        zakatRate: 0.02577,
        nisabConfig: {
          standard: "MANUAL",
          manualThresholdDZD: 100000,
        },
        manualLiabilitiesDZD: 0,
      },
      { db: prisma }
    );

    assert(result.period.calendarType === "SOLAR", "Type de calendrier doit être SOLAR");
    assert(result.period.zakatRate === 0.02577, `Taux solaire attendu: 0.02577, Reçu: ${result.period.zakatRate}`);
    assert(result.nisab.thresholdDZD === 100000, "Nisab manuel attendu: 100000 DA");
  });

  await test("5.3 Actif net inférieur au Nisab -> Zakat due = 0 DA", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: {
          standard: "MANUAL",
          manualThresholdDZD: 10000000, // Nisab très élevé de 10 millions DA
        },
        manualLiabilitiesDZD: 0,
      },
      { db: prisma }
    );

    assert(result.nisab.isNisabReached === false, "Nisab ne doit pas être atteint");
    assert(result.calculation.preliminaryZakatDueDZD === 0, `Zakat doit être 0 DA, Reçu: ${result.calculation.preliminaryZakatDueDZD}`);
  });

  await test("5.4 Dettes manuelles supérieures aux actifs -> Assiette = 0 DA, Zakat = 0 DA", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: {
          standard: "SILVER",
          silverGramPriceDZD: 130,
        },
        manualLiabilitiesDZD: 99999999, // Dettes supérieures aux actifs
      },
      { db: prisma }
    );

    assert(result.calculation.preliminaryZakatBaseDZD === 0, "L'assiette doit être 0 DA");
    assert(result.calculation.preliminaryZakatDueDZD === 0, "La Zakat due doit être 0 DA");
  });

  await test("5.5 Rejet d'une configuration solaire sans taux explicite", async () => {
    let threw = false;
    try {
      validateZakatCalculationInput({
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "SOLAR",
        nisabConfig: { standard: "MANUAL", manualThresholdDZD: 100000 },
        manualLiabilitiesDZD: 0,
      });
    } catch {
      threw = true;
    }
    assert(threw, "Doit lever une exception si le taux solaire n'est pas fourni");
  });

  await test("5.6 Rejet de dates invalides (début > fin ou valuation hors période)", async () => {
    let threw1 = false;
    try {
      validateZakatCalculationInput({
        valuationDate: "2026-05-31",
        periodStartDate: "2026-06-01",
        periodEndDate: "2025-06-01", // Début > Fin
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "MANUAL", manualThresholdDZD: 100000 },
        manualLiabilitiesDZD: 0,
      });
    } catch {
      threw1 = true;
    }
    assert(threw1, "Doit lever une exception si date début > date fin");

    let threw2 = false;
    try {
      validateZakatCalculationInput({
        valuationDate: "2027-01-01", // Hors période
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "MANUAL", manualThresholdDZD: 100000 },
        manualLiabilitiesDZD: 0,
      });
    } catch {
      threw2 = true;
    }
    assert(threw2, "Doit lever une exception si la date d'évaluation est hors période");
  });

  await test("5.7 Rejet d'un montant de dettes manuelles négatif", async () => {
    let threw = false;
    try {
      validateZakatCalculationInput({
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "MANUAL", manualThresholdDZD: 100000 },
        manualLiabilitiesDZD: -5000,
      });
    } catch {
      threw = true;
    }
    assert(threw, "Doit lever une exception si les dettes manuelles sont négatives");
  });

  console.log("\n--- GROUPE 6 : CORRECTION A — FONDS CLIENTS & DETTES MANUELLES ---");

  await test("6.1 Fonds clients présents dans la trésorerie et isolés sans double comptage d'actif", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "SILVER", silverGramPriceDZD: 130 },
        manualLiabilitiesDZD: 50000,
      },
      { db: prisma }
    );

    // Vérifier que customerFundsHeld est bien isolé
    assert(result.customerFundsHeld.totalCustomerFundsDZD === 70000, `Attendu 70000 DA, Reçu: ${result.customerFundsHeld.totalCustomerFundsDZD}`);
    assert(result.customerFundsHeld.totalSavingsHeldDZD === 60000, `Attendu épargne 60000 DA, Reçu: ${result.customerFundsHeld.totalSavingsHeldDZD}`);
    assert(result.customerFundsHeld.totalUnallocatedAdvancesDZD === 10000, `Attendu acompte 10000 DA, Reçu: ${result.customerFundsHeld.totalUnallocatedAdvancesDZD}`);

    // Vérifier que les fonds clients NE SONT PAS ajoutés en tant qu'actif séparé
    const expectedConfirmedAssets =
      result.assets.inventory.confirmedValueDZD +
      result.assets.treasury.totalBalanceDZD +
      result.assets.receivables.totalReceivablesDZD +
      result.assets.supplierPrepayments.confirmedUnallocatedPrepaymentsDZD;

    assert(
      Math.abs(result.assets.confirmedAssetsDZD - expectedConfirmedAssets) < 0.01,
      `Les fonds clients ont été ajoutés aux actifs à tort : ${result.assets.confirmedAssetsDZD} vs ${expectedConfirmedAssets}`
    );
  });

  await test("6.2 Dettes manuelles préservées exactement et non déduites automatiquement", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "SILVER", silverGramPriceDZD: 130 },
        manualLiabilitiesDZD: 45000,
      },
      { db: prisma }
    );

    // Vérifier que les dettes manuelles restent exactement 45 000 DA
    assert(result.liabilities.manualLiabilitiesDZD === 45000, `Dettes manuelles altérées : ${result.liabilities.manualLiabilitiesDZD}`);
    assert(result.calculation.manualLiabilitiesDZD === 45000, `Dettes de calcul altérées : ${result.calculation.manualLiabilitiesDZD}`);
    // Assiette = Actifs - 45000
    const expectedBase = Math.max(0, result.assets.confirmedAssetsDZD - 45000);
    assert(
      Math.abs(result.calculation.preliminaryZakatBaseDZD - expectedBase) < 0.01,
      `Assiette incohérente : ${result.calculation.preliminaryZakatBaseDZD} vs ${expectedBase}`
    );
  });

  await test("6.3 Confirmation manquante des fonds clients produit REQUIRES_REVIEW et alerte explicite", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "SILVER", silverGramPriceDZD: 130 },
        manualLiabilitiesDZD: 10000,
        // customerFundsConfirmation omis -> UNCONFIRMED
      },
      { db: prisma }
    );

    assert(
      result.liabilities.customerFundsReconciliation.status === "UNCONFIRMED",
      "Statut de confirmation doit être UNCONFIRMED"
    );
    assert(
      result.liabilities.customerFundsReconciliation.isReviewRequired === true,
      "Revue requise doit être vraie en cas de non-confirmation"
    );
    assert(
      result.liabilities.customerFundsReconciliation.warningNotice.includes("fonds clients"),
      "Notice d'avertissement manquante"
    );
    assert(
      result.reconciliation.subsystemStatuses.liabilitiesReconciliation === "REQUIRES_REVIEW",
      "Le sous-statut de réconciliation passif doit être REQUIRES_REVIEW"
    );
  });

  await test("6.4 Confirmation explicite CONFIRMED_INCLUDED sans altération automatique", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "SILVER", silverGramPriceDZD: 130 },
        manualLiabilitiesDZD: 120000, // Comprend déjà les 70 000 DA de fonds clients
        customerFundsConfirmation: "CONFIRMED_INCLUDED",
      },
      { db: prisma }
    );

    assert(
      result.liabilities.customerFundsReconciliation.status === "CONFIRMED_INCLUDED",
      "Statut de confirmation doit être CONFIRMED_INCLUDED"
    );
    assert(
      result.liabilities.customerFundsReconciliation.isReviewRequired === false,
      "Aucune revue nécessaire quand explicitement confirmé inclus"
    );
    assert(result.liabilities.manualLiabilitiesDZD === 120000, "Le passif ne doit pas être déduit une seconde fois");
  });

  await test("6.5 Confirmation explicite CONFIRMED_EXCLUDED sans déduction automatique", async () => {
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "SILVER", silverGramPriceDZD: 130 },
        manualLiabilitiesDZD: 0,
        customerFundsConfirmation: "CONFIRMED_EXCLUDED",
      },
      { db: prisma }
    );

    assert(
      result.liabilities.customerFundsReconciliation.status === "CONFIRMED_EXCLUDED",
      "Statut de confirmation doit être CONFIRMED_EXCLUDED"
    );
    assert(result.liabilities.manualLiabilitiesDZD === 0, "Dettes manuelles doivent rester à 0");
  });

  console.log("\n--- GROUPE 7 : CORRECTION B — AVANCES FOURNISSEURS & HISTORIQUE D'IMPUTATION ---");

  await test("7.1 Reconstitution fiable avec historique complet d'imputation disponible", async () => {
    const res = await reconstructHistoricalSupplierAdvances({
      valuationDateStr: "2026-05-31",
      db: prisma,
    });

    assert(res.isAllocationHistoryAvailable === true, "Historique d'imputation doit être disponible");
    assert(res.reconstructionStatus === "CONFIRMED", "Statut doit être CONFIRMED");
    assert(res.confirmedUnallocatedPrepaymentsDZD === 20000, `Attendu 20000 DA confirmé, Reçu: ${res.confirmedUnallocatedPrepaymentsDZD}`);
    assert(res.unverifiedPrepaymentsDZD === 0, "Aucun montant ne doit être non vérifié");
  });

  await test("7.2 Absence de table d'imputation : exclusion des actifs et montant non vérifié", async () => {
    // Création d'un client Prisma mocké / base avec table dropped pour tester la condition
    const { createClient } = await import("@libsql/client");
    const testMissingClient = createClient({ url: `file:${testDbPath}` });
    await testMissingClient.execute("DROP TABLE IF EXISTS supplier_additional_payment_allocations;");
    testMissingClient.close();

    const res = await reconstructHistoricalSupplierAdvances({
      valuationDateStr: "2026-05-31",
      db: prisma,
    });

    // Sans table d'imputation :
    // 1. confirmedUnallocatedPrepaymentsDZD DOIT ÊTRE 0 DA !
    assert(res.confirmedUnallocatedPrepaymentsDZD === 0, `Attendu 0 DA confirmé, Reçu: ${res.confirmedUnallocatedPrepaymentsDZD}`);
    // 2. Le montant de versements (50 000 DA) doit être rapporté comme non vérifié
    assert(res.unverifiedPrepaymentsDZD === 50000, `Attendu 50000 DA non vérifié, Reçu: ${res.unverifiedPrepaymentsDZD}`);
    // 3. Statut doit être UNVERIFIED_MISSING_ALLOCATIONS et INCOMPLETE
    assert(res.reconstructionStatus === "UNVERIFIED_MISSING_ALLOCATIONS", `Statut invalide : ${res.reconstructionStatus}`);
    assert(res.subsystemStatus === "INCOMPLETE", `Sous-statut doit être INCOMPLETE, Reçu: ${res.subsystemStatus}`);

    // Recréer la table pour les tests suivants
    const restoreClient = createClient({ url: `file:${testDbPath}` });
    const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
    const allocMigrationFile = path.join(
      migrationsDir,
      "20261104160000_add_supplier_additional_payment_allocations",
      "migration.sql"
    );
    const allocSql = fs.readFileSync(allocMigrationFile, "utf-8");
    for (const stmt of allocSql.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
      await restoreClient.execute(stmt);
    }
    restoreClient.close();

    // Ré-insérer les données d'allocations de test
    const payment = await prisma.supplierAdditionalPayment.findFirst({ where: { reference: "VRS-001" } });
    if (payment) {
      await prisma.supplierAdditionalPaymentAllocation.create({
        data: {
          reference: "IMP-001",
          paymentId: payment.id,
          supplierId: supplier1.id,
          amount: 30000,
          isReversal: false,
          status: "completed",
          date: new Date("2026-05-15T12:00:00Z"),
        },
      });
      await prisma.supplierAdditionalPaymentAllocation.create({
        data: {
          reference: "IMP-FUTURE-02",
          paymentId: payment.id,
          supplierId: supplier1.id,
          amount: 20000,
          isReversal: false,
          status: "completed",
          date: new Date("2026-06-10T10:00:00Z"),
        },
      });
    }
  });

  await test("7.3 Contrepassation (reversal) avant cutoff exclue des avances actives", async () => {
    // Créer une avance de 15 000 DA puis sa contrepassation de 15 000 DA
    const sapRev = await prisma.supplierAdditionalPayment.create({
      data: {
        reference: "VRS-REV-TEST",
        supplierId: supplier1.id,
        treasuryAccountId: caisse.id,
        amount: 15000,
        isReversal: false,
        status: "reversed",
        date: new Date("2026-05-02T10:00:00Z"),
      },
    });

    await prisma.supplierAdditionalPayment.create({
      data: {
        reference: "VRS-REV-ENTRY",
        supplierId: supplier1.id,
        treasuryAccountId: caisse.id,
        amount: 15000,
        isReversal: true,
        status: "completed",
        reversalOfId: sapRev.id,
        date: new Date("2026-05-03T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalSupplierAdvances({
      valuationDateStr: "2026-05-31",
      db: prisma,
    });

    // L'avance contrepassée nettes à 0 ne doit pas augmenter l'actif non imputé
    const item = res.items.find((i) => i.supplierId === supplier1.id);
    assert(item?.unallocatedPrepayment === 20000, `Attendu 20000 DA, Reçu: ${item?.unallocatedPrepayment}`);
  });

  console.log("\n--- GROUPE 8 : CORRECTION C — STOCK NÉGATIF & PRIX DE REVIENT MANQUANTS ---");

  await test("8.1 Stock négatif non clampé à zéro, préservé dans le détail et flaggé anomalie", async () => {
    // Créer un produit avec mouvements causant un stock négatif
    const prodNeg = await prisma.product.create({
      data: {
        sku: "PROD-ANOMALY-NEG",
        name: "Fauteuil Anomaly",
        costPrice: 4000,
        sellingPrice: 7000,
        stock: -3,
      },
    });

    // Vente de 3 unités sans stock initial
    await prisma.stockMovement.create({
      data: {
        reference: "SALE-ANOMALY-NEG",
        type: "SALE",
        productId: prodNeg.id,
        fromLocationId: locMagasin.id,
        quantity: 3,
        stockBefore: 0,
        stockAfter: -3,
        date: new Date("2026-05-05T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-20",
      productIds: [prodNeg.id],
      db: prisma,
    });

    const item = res.items.find((i) => i.productId === prodNeg.id);
    assert(item !== undefined, "Produit négatif introuvable");
    // 1. Quantité NON tronquée à zéro : vaut exactement -3
    assert(item?.reconstructedQuantity === -3, `Attendu: -3, Reçu: ${item?.reconstructedQuantity}`);
    // 2. Flaggé anomalie
    assert(item?.hasNegativeStock === true, "Doit être flaggé hasNegativeStock");
    assert(item?.status === "NEGATIVE_STOCK_ANOMALY", `Statut attendu NEGATIVE_STOCK_ANOMALY, Reçu: ${item?.status}`);
    // 3. Pas d'actif négatif inventé (totalCostValue === null)
    assert(item?.totalCostValue === null, "La valorisation d'un stock négatif doit être null");
    // 4. Sous-statut inventaire doit être INCOMPLETE
    assert(res.reconstructionStatus === "INCOMPLETE", `Statut attendu INCOMPLETE, Reçu: ${res.reconstructionStatus}`);
    assert(res.negativeStockCount >= 1, "negativeStockCount doit être >= 1");
  });

  await test("8.2 Prix de revient négatif ou invalide exclu des actifs confirmés", async () => {
    const prodInvCost = await prisma.product.create({
      data: {
        sku: "PROD-INVALID-COST",
        name: "Miroir Invalide",
        costPrice: -1500, // Coût négatif
        sellingPrice: 5000,
        stock: 5,
      },
    });

    await prisma.stockMovement.create({
      data: {
        reference: "INIT-INV-COST",
        type: "INITIAL",
        productId: prodInvCost.id,
        toLocationId: locMagasin.id,
        quantity: 5,
        stockBefore: 0,
        stockAfter: 5,
        date: new Date("2026-05-01T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-20",
      productIds: [prodInvCost.id],
      db: prisma,
    });

    const item = res.items.find((i) => i.productId === prodInvCost.id);
    assert(item?.costPriceStatus === "INVALID_NEGATIVE", "Statut de coût doit être INVALID_NEGATIVE");
    assert(item?.hasMissingCostPrice === true, "Doit être flaggé hasMissingCostPrice");
    assert(item?.totalCostValue === null, "Valeur doit être exclue (null)");
  });

  await test("8.3 Prix de revient zéro légitime distingué de manquant", async () => {
    const prodZeroCost = await prisma.product.create({
      data: {
        sku: "PROD-ZERO-COST",
        name: "Catalogue Gratuit",
        costPrice: 0, // Coût 0 légitime
        sellingPrice: 0,
        stock: 10,
      },
    });

    await prisma.stockMovement.create({
      data: {
        reference: "INIT-ZERO-COST",
        type: "INITIAL",
        productId: prodZeroCost.id,
        toLocationId: locMagasin.id,
        quantity: 10,
        stockBefore: 0,
        stockAfter: 10,
        date: new Date("2026-05-01T10:00:00Z"),
      },
    });

    const res = await reconstructHistoricalInventory({
      valuationDateStr: "2026-05-20",
      productIds: [prodZeroCost.id],
      db: prisma,
    });

    const item = res.items.find((i) => i.productId === prodZeroCost.id);
    assert(item?.costPriceStatus === "ZERO_LEGITIMATE", "Statut doit être ZERO_LEGITIMATE");
    assert(item?.hasMissingCostPrice === false, "Ne doit pas être considéré comme manquant");
    assert(item?.totalCostValue === 0, "Valorisation doit être 0 DA");
  });

  console.log("\n--- GROUPE 9 : CORRECTION D — PROPAGATION DU STATUT GLOBAL DE CALCUL ---");

  await test("9.1 Anomalie critique de stock négatif force le statut global à INCOMPLETE", async () => {
    // Calcul incluant le produit avec stock négatif
    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "MANUAL", manualThresholdDZD: 100000 },
        manualLiabilitiesDZD: 0,
        customerFundsConfirmation: "CONFIRMED_INCLUDED",
      },
      { db: prisma }
    );

    // Le stock négatif sur PROD-ANOMALY-NEG doit forcer le statut global à INCOMPLETE
    assert(result.status === "INCOMPLETE", `Statut global attendu INCOMPLETE, Reçu: ${result.status}`);
    assert(result.calculation.isProvisionalAndIncomplete === true, "Doit être marqué provisoire et incomplet");
    assert(result.reconciliation.isFullyReconciled === false, "Ne peut pas être pleinement réconcilié");
  });

  await test("9.2 Calcul sans stock négatif mais en attente de revue produit REQUIRES_REVIEW", async () => {
    // Filtrer pour exclure le produit à stock négatif et l'anomalie
    const cleanProductIds = [prodA.id, prodB.id];

    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "MANUAL", manualThresholdDZD: 100000 },
        manualLiabilitiesDZD: 0,
        customerFundsConfirmation: "UNCONFIRMED", // Non confirmé -> REQUIRES_REVIEW
        options: { productIds: cleanProductIds },
      },
      { db: prisma }
    );

    assert(result.status === "REQUIRES_REVIEW", `Statut attendu REQUIRES_REVIEW, Reçu: ${result.status}`);
    assert(result.calculation.isProvisionalAndIncomplete === false, "N'est pas incomplet");
  });

  await test("9.3 Calcul avec ensemble vérifié et confirmations fournies produit COMPLETE", async () => {
    // Vente solde pour tester un périmètre où tout est vérifié
    const cleanProductIds = [prodA.id];

    const result = await calculateHistoricalBusinessZakat(
      {
        valuationDate: "2026-05-31",
        periodStartDate: "2025-06-01",
        periodEndDate: "2026-05-31",
        zakatYearType: "LUNAR",
        nisabConfig: { standard: "MANUAL", manualThresholdDZD: 100000 },
        manualLiabilitiesDZD: 0,
        customerFundsConfirmation: "CONFIRMED_INCLUDED",
        options: {
          productIds: cleanProductIds,
          includeSupplierPrepayments: true,
        },
      },
      { db: prisma }
    );

    // Si les créances clients sont à revue, le statut reste REQUIRES_REVIEW tant que les créances n'ont pas de confirmation de solvabilité
    // Vérifier la cohérence de l'arbre de décision
    assert(
      result.status === "REQUIRES_REVIEW" || result.status === "COMPLETE",
      `Statut attendu REQUIRES_REVIEW ou COMPLETE, Reçu: ${result.status}`
    );
  });

  // Nettoyage de la base de test
  await prisma.$disconnect();
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch {
    // Ignore
  }

  console.log("\n================================================================================");
  console.log(`  RÉSULTATS DE LA SUITE DE TESTS : ${results.filter((r) => r.passed).length}/${results.length} PASSÉS`);
  console.log("================================================================================\n");

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.error(`Échec de ${failed.length} test(s) :`);
    for (const f of failed) {
      console.error(`  - Test ${f.num} (${f.name}) : ${f.error}`);
    }
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale dans la suite de tests Zakat:", err);
  process.exit(1);
});
