-- CreateTable
CREATE TABLE IF NOT EXISTS "zakat_valuations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "valuationDate" DATETIME NOT NULL,
    "hawlStartDate" DATETIME NOT NULL,
    "hawlEndDate" DATETIME NOT NULL,
    "nisabMethod" TEXT NOT NULL,
    "nisabValueDZD" REAL NOT NULL,
    "nisabGoldPriceDZD" REAL,
    "nisabSilverPriceDZD" REAL,
    "zakatRate" REAL NOT NULL,
    "zakatYearType" TEXT NOT NULL,
    "inventoryValuationMethod" TEXT NOT NULL DEFAULT 'COST',
    "manualLiabilitiesDZD" REAL NOT NULL DEFAULT 0,
    "manualLiabilitiesNote" TEXT,
    "customerFundsConfirmation" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
    "totalInventoryDZD" REAL NOT NULL,
    "totalTreasuryDZD" REAL NOT NULL,
    "totalReceivablesDZD" REAL NOT NULL,
    "totalSupplierPrepaymentsDZD" REAL NOT NULL,
    "unverifiedAssetsDZD" REAL NOT NULL DEFAULT 0,
    "customerFundsHeldDZD" REAL NOT NULL DEFAULT 0,
    "totalAssetsDZD" REAL NOT NULL,
    "totalLiabilitiesDZD" REAL NOT NULL,
    "totalAdjustmentsDZD" REAL NOT NULL DEFAULT 0,
    "zakatableBaseDZD" REAL NOT NULL,
    "zakatDueDZD" REAL NOT NULL,
    "isNisabReached" BOOLEAN NOT NULL DEFAULT false,
    "calculationStatus" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "notes" TEXT,
    "metadataJson" TEXT,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "approvalNotes" TEXT,
    "rejectedAt" DATETIME,
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "zakat_valuation_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "valuationId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "quantity" REAL,
    "unitValueDZD" REAL,
    "totalValueDZD" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zakat_valuation_items_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "zakat_valuations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "zakat_adjustments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "valuationId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountDZD" REAL NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'Gérant',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zakat_adjustments_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "zakat_valuations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "zakat_valuations_reference_key" ON "zakat_valuations"("reference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "zakat_valuations_valuationDate_idx" ON "zakat_valuations"("valuationDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "zakat_valuations_approvalStatus_idx" ON "zakat_valuations"("approvalStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "zakat_valuations_calculationStatus_idx" ON "zakat_valuations"("calculationStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "zakat_valuation_items_valuationId_category_idx" ON "zakat_valuation_items"("valuationId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "zakat_adjustments_valuationId_idx" ON "zakat_adjustments"("valuationId");

