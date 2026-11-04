-- CreateTable
CREATE TABLE "supplier_additional_payments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "treasuryAccountId" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "description" TEXT,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" INTEGER,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "idempotencyKey" TEXT,
    "sessionId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "supplier_additional_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supplier_additional_payments_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "treasury_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supplier_additional_payments_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "supplier_additional_payments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supplier_additional_payments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_additional_payments_reference_key" ON "supplier_additional_payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_additional_payments_reversalOfId_key" ON "supplier_additional_payments"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_additional_payments_idempotencyKey_key" ON "supplier_additional_payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "supplier_additional_payments_supplierId_date_idx" ON "supplier_additional_payments"("supplierId", "date");

-- CreateIndex
CREATE INDEX "supplier_additional_payments_treasuryAccountId_date_idx" ON "supplier_additional_payments"("treasuryAccountId", "date");

-- CreateIndex
CREATE INDEX "supplier_additional_payments_sessionId_idx" ON "supplier_additional_payments"("sessionId");

-- CreateIndex
CREATE INDEX "supplier_additional_payments_status_idx" ON "supplier_additional_payments"("status");

-- CreateIndex
CREATE INDEX "supplier_additional_payments_isReversal_idx" ON "supplier_additional_payments"("isReversal");

