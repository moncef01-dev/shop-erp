-- AlterTable customers
ALTER TABLE "customers" ADD COLUMN "phone2" TEXT;

-- CreateTable customer_advances
CREATE TABLE "customer_advances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "allocatedAmount" REAL NOT NULL DEFAULT 0,
    "refundedAmount" REAL NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "paymentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productInterest" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "sessionId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_advances_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_advances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable customer_advance_allocations
CREATE TABLE "customer_advance_allocations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "advanceId" INTEGER NOT NULL,
    "saleId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "allocatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "customer_advance_allocations_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "customer_advances" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "customer_advance_allocations_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_advances_reference_key" ON "customer_advances"("reference");
CREATE INDEX "customer_advances_customerId_idx" ON "customer_advances"("customerId");
CREATE INDEX "customer_advances_status_idx" ON "customer_advances"("status");
CREATE INDEX "customer_advances_paymentDate_idx" ON "customer_advances"("paymentDate");
CREATE INDEX "customer_advances_sessionId_idx" ON "customer_advances"("sessionId");

-- CreateIndex
CREATE INDEX "customer_advance_allocations_advanceId_idx" ON "customer_advance_allocations"("advanceId");
CREATE INDEX "customer_advance_allocations_saleId_idx" ON "customer_advance_allocations"("saleId");
