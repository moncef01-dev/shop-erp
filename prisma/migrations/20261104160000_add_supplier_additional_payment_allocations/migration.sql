-- CreateTable
CREATE TABLE "supplier_additional_payment_allocations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "purchaseId" INTEGER,
    "supplierDebtId" INTEGER,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "description" TEXT,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" INTEGER,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "supplier_additional_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "supplier_additional_payments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supplier_additional_payment_allocations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supplier_additional_payment_allocations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "supplier_additional_payment_allocations_supplierDebtId_fkey" FOREIGN KEY ("supplierDebtId") REFERENCES "supplier_debts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "supplier_additional_payment_allocations_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "supplier_additional_payment_allocations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_additional_payment_allocations_reference_key" ON "supplier_additional_payment_allocations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_additional_payment_allocations_reversalOfId_key" ON "supplier_additional_payment_allocations"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_additional_payment_allocations_idempotencyKey_key" ON "supplier_additional_payment_allocations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "supplier_additional_payment_allocations_supplierId_date_idx" ON "supplier_additional_payment_allocations"("supplierId", "date");

-- CreateIndex
CREATE INDEX "supplier_additional_payment_allocations_paymentId_idx" ON "supplier_additional_payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "supplier_additional_payment_allocations_purchaseId_idx" ON "supplier_additional_payment_allocations"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_additional_payment_allocations_supplierDebtId_idx" ON "supplier_additional_payment_allocations"("supplierDebtId");

-- CreateIndex
CREATE INDEX "supplier_additional_payment_allocations_status_idx" ON "supplier_additional_payment_allocations"("status");

-- CreateIndex
CREATE INDEX "supplier_additional_payment_allocations_isReversal_idx" ON "supplier_additional_payment_allocations"("isReversal");

