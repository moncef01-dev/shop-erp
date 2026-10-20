-- CreateTable treasury_accounts
CREATE TABLE "treasury_accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'cash',
    "openingBalance" REAL NOT NULL DEFAULT 0,
    "openingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable treasury_transfers
CREATE TABLE "treasury_transfers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "fromAccountId" INTEGER NOT NULL,
    "toAccountId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "motif" TEXT NOT NULL,
    "notes" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "treasury_transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "treasury_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "treasury_transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "treasury_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "treasury_transfers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable supplier_debts
CREATE TABLE "supplier_debts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'initial_debt',
    "description" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_debts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable payments
ALTER TABLE "payments" ADD COLUMN "accountId" INTEGER;
ALTER TABLE "payments" ADD COLUMN "supplierId" INTEGER;

-- AlterTable expenses
ALTER TABLE "expenses" ADD COLUMN "accountId" INTEGER;

-- AlterTable customer_advances
ALTER TABLE "customer_advances" ADD COLUMN "accountId" INTEGER;

-- AlterTable cash_sessions
ALTER TABLE "cash_sessions" ADD COLUMN "accountId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_code_key" ON "treasury_accounts"("code");
CREATE INDEX "treasury_accounts_type_idx" ON "treasury_accounts"("type");
CREATE INDEX "treasury_accounts_isActive_idx" ON "treasury_accounts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_transfers_reference_key" ON "treasury_transfers"("reference");
CREATE INDEX "treasury_transfers_fromAccountId_idx" ON "treasury_transfers"("fromAccountId");
CREATE INDEX "treasury_transfers_toAccountId_idx" ON "treasury_transfers"("toAccountId");
CREATE INDEX "treasury_transfers_date_idx" ON "treasury_transfers"("date");
CREATE INDEX "treasury_transfers_sessionId_idx" ON "treasury_transfers"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_debts_reference_key" ON "supplier_debts"("reference");
CREATE INDEX "supplier_debts_supplierId_idx" ON "supplier_debts"("supplierId");
CREATE INDEX "supplier_debts_date_idx" ON "supplier_debts"("date");

-- CreateIndex
CREATE INDEX "payments_accountId_idx" ON "payments"("accountId");
CREATE INDEX "payments_supplierId_idx" ON "payments"("supplierId");
CREATE INDEX "expenses_accountId_idx" ON "expenses"("accountId");
CREATE INDEX "customer_advances_accountId_idx" ON "customer_advances"("accountId");
CREATE INDEX "cash_sessions_accountId_idx" ON "cash_sessions"("accountId");

-- Insert standard treasury accounts
INSERT OR IGNORE INTO "treasury_accounts" ("id", "code", "name", "type", "openingBalance", "isDefault", "isActive", "notes")
VALUES (1, 'ACC-CAISSE', 'Caisse journalière', 'cash', 0, 1, 1, 'Caisse physique du magasin');

INSERT OR IGNORE INTO "treasury_accounts" ("id", "code", "name", "type", "openingBalance", "isDefault", "isActive", "notes")
VALUES (2, 'ACC-COFFRE-MAGASIN', 'Coffre magasin', 'safe', 0, 0, 1, 'Coffre-fort principal du showroom');

INSERT OR IGNORE INTO "treasury_accounts" ("id", "code", "name", "type", "openingBalance", "isDefault", "isActive", "notes")
VALUES (3, 'ACC-COFFRE-MAISON', 'Coffre maison', 'safe', 0, 0, 1, 'Coffre de sécurité extérieur');

INSERT OR IGNORE INTO "treasury_accounts" ("id", "code", "name", "type", "openingBalance", "isDefault", "isActive", "notes")
VALUES (4, 'ACC-BANQUE', 'Compte bancaire', 'bank', 0, 0, 1, 'Compte bancaire principal');
