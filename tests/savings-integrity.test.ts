/**
 * Integration Test Suite: Customer Savings & Store Credit (Épargne Client / Avoir Client)
 *
 * Validates:
 * 1. Multiple deposits & accurate cash inflow accounting.
 * 2. Rejection of invalid (zero / negative) deposits.
 * 3. Deduction of savings on sale creation without double-counting cash.
 * 4. Rejection of deductions exceeding available balance.
 * 5. Allocation of savings to existing unpaid invoices.
 * 6. Protection against over-allocating beyond invoice balance.
 * 7. Cross-customer savings protection (cannot spend another customer's savings).
 * 8. Partial and full refunds with accurate cash outflow accounting.
 * 9. Sale cancellation compensating reversals (REVERSAL ledger entry without cash refund).
 * 10. Immutability of closed historical cash sessions.
 * 11. Complete financial separation between Customer Savings and Customer Advances.
 *
 * Runs strictly against an isolated temporary SQLite database: prisma/test_savings_runner.db
 * NEVER touches the real shop database (prisma/shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_savings_runner.db");
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
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ : ÉPARGNE CLIENT & AVOIRS");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Initialiser le schéma via les migrations existantes
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

  // 2. Créer les tables non présentes dans les migrations initiales (Monthly Closing & Customer Savings)
  const additionalSchemaSql = `
    CREATE TABLE IF NOT EXISTS "monthly_closing_checklists" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "month" TEXT NOT NULL,
        "itemKey" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "note" TEXT,
        "checkedBy" TEXT DEFAULT 'Opérateur',
        "checkedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closing_checklists_month_itemKey_key" ON "monthly_closing_checklists"("month", "itemKey");
    CREATE INDEX IF NOT EXISTS "monthly_closing_checklists_month_idx" ON "monthly_closing_checklists"("month");

    CREATE TABLE IF NOT EXISTS "monthly_closing_snapshots" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "reference" TEXT NOT NULL,
        "month" TEXT NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 1,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "title" TEXT,
        "notes" TEXT,
        "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "generatedBy" TEXT DEFAULT 'Opérateur',
        "periodStart" DATETIME NOT NULL,
        "periodEnd" DATETIME NOT NULL,
        "totalsJson" TEXT NOT NULL,
        "checklistJson" TEXT NOT NULL,
        "discrepanciesJson" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closing_snapshots_reference_key" ON "monthly_closing_snapshots"("reference");
    CREATE INDEX IF NOT EXISTS "monthly_closing_snapshots_month_idx" ON "monthly_closing_snapshots"("month");
    CREATE INDEX IF NOT EXISTS "monthly_closing_snapshots_status_idx" ON "monthly_closing_snapshots"("status");

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
    CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closing_periods_month_key" ON "monthly_closing_periods"("month");
    CREATE INDEX IF NOT EXISTS "monthly_closing_periods_status_idx" ON "monthly_closing_periods"("status");

    CREATE TABLE IF NOT EXISTS "monthly_closing_audit_logs" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "periodId" INTEGER,
        "month" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "fromStatus" TEXT,
        "toStatus" TEXT NOT NULL,
        "operator" TEXT NOT NULL DEFAULT 'Opérateur',
        "reason" TEXT,
        "snapshotRef" TEXT,
        "version" INTEGER,
        "metadataJson" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "monthly_closing_audit_logs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "monthly_closing_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX IF NOT EXISTS "monthly_closing_audit_logs_month_idx" ON "monthly_closing_audit_logs"("month");
    CREATE INDEX IF NOT EXISTS "monthly_closing_audit_logs_createdAt_idx" ON "monthly_closing_audit_logs"("createdAt");

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
    CREATE INDEX IF NOT EXISTS "customer_savings_transactions_customerId_idx" ON "customer_savings_transactions"("customerId");
    CREATE INDEX IF NOT EXISTS "customer_savings_transactions_accountId_idx" ON "customer_savings_transactions"("accountId");
    CREATE INDEX IF NOT EXISTS "customer_savings_transactions_type_idx" ON "customer_savings_transactions"("type");
    CREATE INDEX IF NOT EXISTS "customer_savings_transactions_saleId_idx" ON "customer_savings_transactions"("saleId");
    CREATE INDEX IF NOT EXISTS "customer_savings_transactions_date_idx" ON "customer_savings_transactions"("date");
    CREATE INDEX IF NOT EXISTS "customer_savings_transactions_sessionId_idx" ON "customer_savings_transactions"("sessionId");
  `;

  for (const stmt of additionalSchemaSql.split(";").map((s) => s.trim()).filter((s) => s.length > 0)) {
    await ddlClient.execute(stmt);
  }
  ddlClient.close();

  // 3. Charger le client prisma et les actions
  const { prisma } = await import("@/lib/prisma");
  const savingsActions = await import("@/app/savings/actions");
  const salesActions = await import("@/app/sales/actions");
  const cashActions = await import("@/app/cash/actions");

  // 4. Données de base
  const defaultLoc = await prisma.location.create({
    data: { name: "Dépôt Principal Test", code: "DEP-TEST", isDefault: true },
  });

  const category = await prisma.category.create({
    data: { name: "Salons Test" },
  });

  const productA = await prisma.product.create({
    data: {
      sku: "CAN-TEST-001",
      name: "Canapé 3 Places Test",
      categoryId: category.id,
      sellingPrice: 50000,
    },
  });

  await prisma.productStock.create({
    data: { productId: productA.id, locationId: defaultLoc.id, quantity: 20 },
  });

  const customerAlpha = await prisma.customer.create({
    data: {
      code: "CLI-ALPHA",
      name: "Client Alpha Test",
      phone: "0555000001",
      isActive: true,
    },
  });

  const customerBeta = await prisma.customer.create({
    data: {
      code: "CLI-BETA",
      name: "Client Beta Test",
      phone: "0555000002",
      isActive: true,
    },
  });

  let activeSessionId: number | null = null;

  // ─── TEST 01 : DÉPÔTS MULTIPLES & TRAÇABILITÉ CAISSE ──────────────────────
  await executeTest(1, "Dépôts multiples sans facture & traçabilité caisse physique", async () => {
    // Ouvrir une session de caisse
    const sessionRes = await cashActions.openCashSessionAction({
      openingAmount: 10000,
      openingNotes: "Session de test ouverture",
    });
    assert(sessionRes.success === true, "La session de caisse doit s'ouvrir avec succès: " + sessionRes.error);
    const sessionData = sessionRes.data as { id: number } | undefined;
    activeSessionId = sessionData?.id ?? null;
    assert(activeSessionId !== null, "L'id de session doit être défini.");

    // Premier dépôt : 15 000 DA en espèces
    const dep1 = await savingsActions.recordSavingsDepositAction({
      customerId: customerAlpha.id,
      amount: 15000,
      paymentMethod: "cash",
      notes: "Premier acompte sans facture",
    });
    assert(dep1.success === true, "Le premier dépôt doit réussir: " + dep1.error);
    assert(dep1.data?.transaction.balanceAfter === 15000, "Le solde après tx doit être de 15 000 DA.");

    const acc1 = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(acc1?.balance === 15000, "Le solde en compte doit être de 15 000 DA.");
    assert(acc1?.totalDeposited === 15000, "Le total déposé doit être de 15 000 DA.");

    // Vérifier que la caisse a bien enregistré le flux entrant en espèces
    const sessionAfterDep1 = await prisma.cashSession.findUnique({
      where: { id: activeSessionId! },
    });
    assert(sessionAfterDep1?.totalCashIn === 15000, "La caisse doit avoir totalCashIn = 15 000 DA.");

    // Deuxième dépôt : 10 000 DA via CIB (non-espèces)
    const dep2 = await savingsActions.recordSavingsDepositAction({
      customerId: customerAlpha.id,
      amount: 10000,
      paymentMethod: "cib",
      notes: "Second dépôt par carte",
    });
    assert(dep2.success === true, "Le second dépôt doit réussir: " + dep2.error);
    assert(dep2.data?.transaction.balanceAfter === 25000, "Le solde après 2e tx doit être de 25 000 DA.");

    const acc2 = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(acc2?.balance === 25000, "Le solde cumulé doit être à 25 000 DA.");
    assert(acc2?.totalDeposited === 25000, "Le total déposé cumulé doit être de 25 000 DA.");

    // Vérifier que le paiement CIB n'a PAS gonflé l'encaissement physique de la caisse
    const sessionAfterDep2 = await prisma.cashSession.findUnique({
      where: { id: activeSessionId! },
    });
    assert(sessionAfterDep2?.totalCashIn === 15000, "Le flux d'espèces physique de caisse ne doit pas augmenter pour CIB.");
  });

  // ─── TEST 02 : REJET DES DÉPÔTS INVALIDES ────────────────────────────────
  await executeTest(2, "Rejet des dépôts négatifs, nuls ou clients inexistants", async () => {
    const resNegative = await savingsActions.recordSavingsDepositAction({
      customerId: customerAlpha.id,
      amount: -5000,
      paymentMethod: "cash",
    });
    assert(!resNegative.success, "Un montant négatif doit être rejeté.");

    const resZero = await savingsActions.recordSavingsDepositAction({
      customerId: customerAlpha.id,
      amount: 0,
      paymentMethod: "cash",
    });
    assert(!resZero.success, "Un montant nul doit être rejeté.");

    const resInvalidCust = await savingsActions.recordSavingsDepositAction({
      customerId: 99999,
      amount: 5000,
      paymentMethod: "cash",
    });
    assert(!resInvalidCust.success, "Un client inexistant doit être rejeté.");
  });

  // ─── TEST 03 : DÉDUCTION SUR CRÉATION DE VENTE (NOUVELLE FACTURE) ──────────
  let sale1Id: number | null = null;
  await executeTest(3, "Déduction de l'épargne sur vente sans double flux d'espèces", async () => {
    // Vente de 30 000 DA : 20 000 DA depuis l'épargne + 5 000 DA espèces immédiat + 5 000 DA restant dû (crédit)
    const saleRes = await salesActions.createSaleAction({
      customerId: customerAlpha.id,
      saleDate: new Date().toISOString().slice(0, 10),
      notes: "Vente test avec déduction épargne",
      status: "confirmed",
      items: [
        {
          productId: productA.id,
          locationId: defaultLoc.id,
          quantity: 1,
          unitPrice: 30000,
        },
      ],
      savingsUsed: 20000,
      initialPayment: {
        amount: 5000,
        method: "cash",
        notes: "Versement complémentaire",
      },
    });

    assert(saleRes.success === true, "La vente doit être créée avec succès: " + saleRes.error);
    const sale = saleRes.data as {
      id: number;
      totalAmount: number;
      paidAmount: number;
      status: string;
      paymentStatus: string;
    };
    assert(sale !== null && sale !== undefined, "La vente retournée ne doit pas être nulle.");
    sale1Id = sale.id;

    assert(sale.totalAmount === 30000, "Le total facture doit être 30 000 DA.");
    assert(sale.paidAmount === 25000, "Le montant payé total (épargne + espèces) doit être 25 000 DA.");
    assert(sale.status === "confirmed", "La vente doit être confirmée.");
    assert(sale.paymentStatus === "partial", "Le statut de paiement doit être 'partial' car il reste 5 000 DA dû.");

    // Vérifier le solde d'épargne : 25 000 - 20 000 = 5 000 DA
    const acc = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(acc?.balance === 5000, "Le solde restant d'épargne doit être de 5 000 DA.");
    assert(acc?.totalUsed === 20000, "Le montant utilisé doit être de 20 000 DA.");

    // Vérifier les règlements de la facture :
    // - 1 règlement "savings" de 20 000 DA
    // - 1 règlement "cash" de 5 000 DA
    const payments = await prisma.payment.findMany({
      where: { saleId: sale.id },
    });
    assert(payments.length === 2, "La facture doit contenir exactement 2 règlements.");
    const savingsPmt = payments.find((p) => p.method === "savings");
    const cashPmt = payments.find((p) => p.method === "cash");
    assert(savingsPmt !== undefined && savingsPmt.amount === 20000, "Règlement épargne de 20 000 DA.");
    assert(savingsPmt!.sessionId === null, "Le règlement par épargne ne doit pas être rattaché à la session physique.");
    assert(cashPmt !== undefined && cashPmt.amount === 5000, "Règlement espèces de 5 000 DA.");

    // Vérifier la caisse physique : aucun flux d'espèces n'a été créé pour les 20 000 DA d'épargne
    const sessionPayments = await prisma.payment.findMany({
      where: { sessionId: activeSessionId! },
    });
    const sessionPaymentsTotal = sessionPayments.reduce((sum, p) => sum + p.amount, 0);
    assert(sessionPaymentsTotal === 5000, "Seul le paiement en espèces de 5 000 DA est rattaché à la session.");

    const savingsIncomeExpense = await prisma.expense.findFirst({
      where: { amount: 20000, type: "income" },
    });
    assert(savingsIncomeExpense === null, "Aucun flux d'encaissement n'a été créé pour la déduction d'épargne.");
  });

  // ─── TEST 04 : REJET DES DÉDUCTIONS SUPÉRIEURES AU SOLDE DISPONIBLE ────────
  await executeTest(4, "Rejet des déductions d'épargne excédant le solde disponible", async () => {
    // Solde actuel de Client Alpha : 5 000 DA
    const saleRes = await salesActions.createSaleAction({
      customerId: customerAlpha.id,
      saleDate: new Date().toISOString().slice(0, 10),
      status: "confirmed",
      items: [
        {
          productId: productA.id,
          locationId: defaultLoc.id,
          quantity: 1,
          unitPrice: 10000,
        },
      ],
      savingsUsed: 6000, // 6 000 > 5 000 disponible
    });

    assert(!saleRes.success, "La création de vente avec déduction excessive doit échouer.");
    const acc = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(acc?.balance === 5000, "Le solde d'épargne doit rester strictement inchangé à 5 000 DA.");
  });

  // ─── TEST 05 : ALLOCATION D'ÉPARGNE SUR FACTURE EXISTANTE EN DETTE ──────────
  await executeTest(5, "Allocation d'épargne sur facture existante en dette", async () => {
    assert(sale1Id !== null, "La vente 1 doit exister.");
    // Sur la vente 1, il reste 5 000 DA dû. On alloue 3 000 DA d'épargne.
    const allocRes = await savingsActions.allocateSavingsToInvoiceAction({
      customerId: customerAlpha.id,
      saleId: sale1Id!,
      amount: 3000,
      notes: "Règlement partiel solde facture",
    });

    assert(allocRes.success === true, "L'allocation d'épargne doit réussir: " + allocRes.error);
    const accAfterAlloc1 = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(accAfterAlloc1?.balance === 2000, "Le solde restant d'épargne doit être de 2 000 DA.");

    // Vérifier la facture mise à jour
    const updatedSale = await prisma.sales.findUnique({
      where: { id: sale1Id! },
    });
    assert(updatedSale?.paidAmount === 28000, "Le montant payé doit être 25 000 + 3 000 = 28 000 DA.");
    assert(updatedSale?.paymentStatus === "partial", "Le statut de paiement reste partiel (reste 2 000 DA).");

    // Allouer les 2 000 DA restants pour solder la facture
    const allocRes2 = await savingsActions.allocateSavingsToInvoiceAction({
      customerId: customerAlpha.id,
      saleId: sale1Id!,
      amount: 2000,
    });
    assert(allocRes2.success === true, "L'allocation finale doit réussir: " + allocRes2.error);
    const accAfterAlloc2 = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(accAfterAlloc2?.balance === 0, "Le solde d'épargne doit maintenant être 0 DA.");

    const fullyPaidSale = await prisma.sales.findUnique({
      where: { id: sale1Id! },
    });
    assert(fullyPaidSale?.paidAmount === 30000, "La facture doit être payée à 100% (30 000 DA).");
    assert(fullyPaidSale?.paymentStatus === "paid", "Le statut de paiement doit être 'paid'.");
  });

  // ─── TEST 06 : REJET DE SUR-ALLOCATION SUR FACTURE DÉJÀ SOLDÉE ─────────────
  await executeTest(6, "Rejet de l'allocation d'épargne sur facture déjà soldée", async () => {
    // Re-créditer 5 000 DA
    await savingsActions.recordSavingsDepositAction({
      customerId: customerAlpha.id,
      amount: 5000,
      paymentMethod: "cash",
    });

    // Tenter d'allouer à la vente 1 qui est déjà entièrement réglée
    const overAlloc = await savingsActions.allocateSavingsToInvoiceAction({
      customerId: customerAlpha.id,
      saleId: sale1Id!,
      amount: 1000,
    });
    assert(!overAlloc.success, "L'allocation sur une facture déjà soldée doit être rejetée.");
  });

  // ─── TEST 07 : PROTECTION INTER-CLIENTS (CROSS-CUSTOMER SECURITY) ─────────
  await executeTest(7, "Protection stricte contre l'utilisation de l'épargne d'un autre client", async () => {
    // Client Beta crée une vente
    const betaSale = await salesActions.createSaleAction({
      customerId: customerBeta.id,
      saleDate: new Date().toISOString().slice(0, 10),
      status: "confirmed",
      items: [
        {
          productId: productA.id,
          locationId: defaultLoc.id,
          quantity: 1,
          unitPrice: 15000,
        },
      ],
    });
    assert(betaSale.success === true, "Vente Client Beta créée.");
    const betaSaleData = betaSale.data as { id: number };

    // Tenter d'allouer l'épargne de Client Alpha sur la facture de Client Beta
    const crossAlloc = await savingsActions.allocateSavingsToInvoiceAction({
      customerId: customerAlpha.id,
      saleId: betaSaleData.id,
      amount: 2000,
    });
    assert(!crossAlloc.success, "L'utilisation de l'épargne d'un client sur la facture d'un autre doit être rejetée.");
    assert(
      crossAlloc.error?.includes("un autre client") === true,
      "Le message d'erreur doit explicitement mentionner la discordance de client."
    );
  });

  // ─── TEST 08 : REMBOURSEMENTS PARTIELS & TOTAUX & SORTIE DE CAISSE ─────────
  await executeTest(8, "Remboursements d'épargne partiel/total et sortie de caisse physique", async () => {
    // Client Alpha a actuellement 5 000 DA d'épargne.
    // Session actuelle : totalCashIn = 25 000 DA, totalCashOut = 0 DA.

    // Remboursement partiel : 2 000 DA en espèces
    const ref1 = await savingsActions.recordSavingsRefundAction({
      customerId: customerAlpha.id,
      amount: 2000,
      paymentMethod: "cash",
      reason: "Demande de restitution partielle client",
    });
    assert(ref1.success === true, "Le remboursement de 2 000 DA doit réussir: " + ref1.error);
    const accRef1 = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(accRef1?.balance === 3000, "Le solde restant doit être de 3 000 DA.");
    assert(accRef1?.totalRefunded === 2000, "Le total remboursé doit être de 2 000 DA.");

    // Vérifier la caisse : totalCashOut a augmenté de 2 000 DA
    const sessionAfterRef1 = await prisma.cashSession.findUnique({
      where: { id: activeSessionId! },
    });
    assert(sessionAfterRef1?.totalCashOut === 2000, "La caisse physique doit comptabiliser 2 000 DA de décaissement.");

    // Tentative de remboursement excédant le solde disponible (ex: 4 000 > 3 000)
    const refExcess = await savingsActions.recordSavingsRefundAction({
      customerId: customerAlpha.id,
      amount: 4000,
      paymentMethod: "cash",
      reason: "Excédentaire",
    });
    assert(!refExcess.success, "Un remboursement supérieur au solde doit être rejeté.");

    // Remboursement du reste : 3 000 DA
    const ref2 = await savingsActions.recordSavingsRefundAction({
      customerId: customerAlpha.id,
      amount: 3000,
      paymentMethod: "cash",
      reason: "Clôture du compte d'épargne",
    });
    assert(ref2.success === true, "Le remboursement complet doit réussir: " + ref2.error);
    const accRef2 = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    assert(accRef2?.balance === 0, "Le solde doit être exactement 0 DA.");
    assert(accRef2?.totalRefunded === 5000, "Le total remboursé cumulé doit être de 5 000 DA.");

    const sessionAfterRef2 = await prisma.cashSession.findUnique({
      where: { id: activeSessionId! },
    });
    assert(sessionAfterRef2?.totalCashOut === 5000, "La caisse physique doit totaliser 5 000 DA de décaissement.");
  });

  // ─── TEST 09 : ANNULATION DE VENTE & ÉCRITURE COMPENSATOIRE (REVERSAL) ─────
  await executeTest(9, "Annulation de vente et restitution d'épargne par écriture compensatoire (REVERSAL)", async () => {
    // 1. Déposer 12 000 DA pour Client Beta
    await savingsActions.recordSavingsDepositAction({
      customerId: customerBeta.id,
      amount: 12000,
      paymentMethod: "cash",
      notes: "Dépôt d'attente pour meuble",
    });

    // 2. Créer une vente de 10 000 DA en utilisant 8 000 DA d'épargne + 2 000 DA en espèces
    const saleRes = await salesActions.createSaleAction({
      customerId: customerBeta.id,
      saleDate: new Date().toISOString().slice(0, 10),
      status: "confirmed",
      items: [
        {
          productId: productA.id,
          locationId: defaultLoc.id,
          quantity: 1,
          unitPrice: 10000,
        },
      ],
      savingsUsed: 8000,
      initialPayment: {
        amount: 2000,
        method: "cash",
      },
    });
    assert(saleRes.success === true, "Vente créée: " + saleRes.error);
    const saleResData = saleRes.data as { id: number };
    const saleIdToCancel = saleResData.id;

    // Solde Beta après vente : 12 000 - 8 000 = 4 000 DA
    const accPreCancel = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerBeta.id },
    });
    assert(accPreCancel?.balance === 4000, "Solde d'épargne à 4 000 DA après achat.");

    // 3. Annuler la vente
    const cancelRes = await salesActions.cancelSaleAction(saleIdToCancel, "Annulation commande client");
    assert(cancelRes.success === true, "L'annulation de vente doit réussir: " + cancelRes.error);

    // 4. Vérifier que le solde d'épargne a été restauré à 12 000 DA
    const accPostCancel = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerBeta.id },
    });
    assert(accPostCancel?.balance === 12000, "Le solde d'épargne doit être restauré à 12 000 DA (4 000 + 8 000).");

    // 5. Vérifier qu'une écriture compensatoire REVERSAL a été enregistrée dans le grand livre
    const reversalTx = await prisma.customerSavingsTransaction.findFirst({
      where: {
        customerId: customerBeta.id,
        type: "REVERSAL",
        saleId: saleIdToCancel,
      },
    });
    assert(reversalTx !== null, "Une transaction compensatoire REVERSAL doit exister.");
    assert(reversalTx!.amount === 8000, "Le montant du REVERSAL doit être exactement de 8 000 DA.");
    assert(reversalTx!.direction === "IN", "La direction du REVERSAL doit être 'IN'.");
    assert(reversalTx!.balanceAfter === 12000, "Le balanceAfter doit être 12 000 DA.");

    // 6. Vérifier que la part épargne n'a PAS fait l'objet d'un remboursement d'espèces en dépense
    const savingsRefundExpense = await prisma.expense.findFirst({
      where: {
        category: "refund",
        amount: 8000,
      },
    });
    assert(savingsRefundExpense === null, "Aucun décaissement en espèces ne doit être créé pour la déduction d'épargne.");
  });

  // ─── TEST 10 : IMMUTABILITÉ DES SESSIONS DE CAISSE CLÔTURÉES ──────────────
  await executeTest(10, "Protection et immutabilité stricte des sessions de caisse clôturées", async () => {
    // Clôturer la session de caisse en cours
    const closeRes = await cashActions.closeCashSessionAction({
      sessionId: activeSessionId!,
      closingAmount: 25000,
      closingNotes: "Clôture normale de fin de journée",
    });
    assert(closeRes.success === true, "La session doit être clôturée: " + closeRes.error);

    const closedSession = await prisma.cashSession.findUnique({
      where: { id: activeSessionId! },
    });
    assert(closedSession?.status === "closed", "La session est bien clôturée.");
    const snapshotIn = closedSession!.totalCashIn;
    const snapshotOut = closedSession!.totalCashOut;
    const snapshotClosing = closedSession!.closingAmount;

    // Effectuer une transaction d'épargne ultérieure (ex: dépôt hors session ou nouveau dépôt)
    const lateDep = await savingsActions.recordSavingsDepositAction({
      customerId: customerAlpha.id,
      amount: 7000,
      paymentMethod: "cash",
      notes: "Dépôt enregistré alors que la session précédente est fermée",
    });
    assert(lateDep.success === true, "Le dépôt doit être accepté même caisse fermée: " + lateDep.error);

    // Vérifier que la session clôturée n'a STRICTEMENT pas été modifiée rétroactivement
    const closedSessionAfter = await prisma.cashSession.findUnique({
      where: { id: activeSessionId! },
    });
    assert(closedSessionAfter?.status === "closed", "Le statut de la session clôturée reste inchangé.");
    assert(closedSessionAfter?.totalCashIn === snapshotIn, "totalCashIn de la session clôturée ne doit pas bouger.");
    assert(closedSessionAfter?.totalCashOut === snapshotOut, "totalCashOut de la session clôturée ne doit pas bouger.");
    assert(closedSessionAfter?.closingAmount === snapshotClosing, "closingAmount ne doit pas bouger.");
  });

  // ─── TEST 11 : SÉPARATION STRICTE AVEC LES ACOMPTES VENTES CLASSIQUES ────
  await executeTest(11, "Indépendance financière totale entre Épargne Client et Acomptes Ordinaires", async () => {
    const advancesActions = await import("@/app/sales/advances-actions");

    // Créer un acompte ordinaire (CustomerAdvance) de 6 000 DA pour Client Alpha
    const advRes = await advancesActions.createCustomerAdvanceAction({
      customerId: customerAlpha.id,
      amount: 6000,
      method: "cash",
      notes: "Acompte commande salon ordinaire",
    });
    assert(advRes.success === true, "Création acompte ordinaire réussie: " + advRes.error);

    // Vérifier que le solde de l'épargne n'est PAS contaminé par l'acompte ordinaire
    const savingsAccount = await prisma.customerSavingsAccount.findUnique({
      where: { customerId: customerAlpha.id },
    });
    // Avant l'acompte, Client Alpha avait reçu le dépôt de 7 000 DA
    assert(
      savingsAccount?.balance === 7000,
      `Le solde d'épargne (${savingsAccount?.balance} DA) doit être totalement indépendant de l'acompte ordinaire (6 000 DA).`
    );

    // Vérifier que l'acompte ordinaire apparaît dans CustomerAdvance et non dans CustomerSavingsTransaction
    const advData = advRes.data as { id: number };
    const advanceRecord = await prisma.customerAdvance.findUnique({
      where: { id: advData.id },
    });
    assert(advanceRecord !== null, "L'acompte ordinaire existe dans sa propre table.");

    const savingsTxCount = await prisma.customerSavingsTransaction.count({
      where: { customerId: customerAlpha.id, description: { contains: "salon ordinaire" } },
    });
    assert(savingsTxCount === 0, "L'acompte ordinaire ne doit pas figurer dans le journal de l'épargne.");
  });

  // ─── NETTOYAGE BASE DE TEST ISOLÉE ────────────────────────────────────────
  console.log("\n  Nettoyage de la base de test temporaire...");
  await prisma.$disconnect();
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log("  Base temporaire", testDbPath, "supprimée avec succès.");
    }
  } catch {
    console.log("  (Fichier test temporaire nettoyé)");
  }

  // ─── RÉCAPITULATIF ─────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  RÉSULTATS DE LA SUITE ÉPARGNE & AVOIR CLIENT : ${passed}/${total} RÉUSSIS`);
  if (failed > 0) {
    console.error(`  ÉCHECS : ${failed} test(s) ont échoué.`);
    process.exit(1);
  } else {
    console.log("  TOUS LES 11 TESTS D'INTÉGRITÉ FINANCIÈRE DE L'ÉPARGNE SONT VALIDÉS AVEC SUCCÈS !");
    console.log("================================================================================\n");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale d'exécution de la suite de tests Épargne :", err);
  process.exit(1);
});
