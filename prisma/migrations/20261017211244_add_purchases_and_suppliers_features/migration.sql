-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "purchaseId" INTEGER NOT NULL,
    "receiptDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "purchase_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "receiptId" INTEGER NOT NULL,
    "purchaseItemId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" REAL,
    CONSTRAINT "purchase_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "purchase_receipt_items_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "purchase_receipt_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_receipt_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_purchase_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchaseId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "purchase_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "purchase_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_purchase_items" ("id", "productId", "purchaseId", "quantity", "subtotal", "unitCost") SELECT "id", "productId", "purchaseId", "quantity", "subtotal", "unitCost" FROM "purchase_items";
DROP TABLE "purchase_items";
ALTER TABLE "new_purchase_items" RENAME TO "purchase_items";
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");
CREATE INDEX "purchase_items_productId_idx" ON "purchase_items"("productId");
CREATE INDEX "purchase_items_locationId_idx" ON "purchase_items"("locationId");
CREATE TABLE "new_purchases" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "supplierId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "receiptStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "expectedDeliveryDate" DATETIME,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_purchases" ("createdAt", "id", "notes", "paidAmount", "purchaseDate", "reference", "status", "supplierId", "totalAmount", "updatedAt") SELECT "createdAt", "id", "notes", "paidAmount", "purchaseDate", "reference", "status", "supplierId", "totalAmount", "updatedAt" FROM "purchases";
DROP TABLE "purchases";
ALTER TABLE "new_purchases" RENAME TO "purchases";
CREATE UNIQUE INDEX "purchases_reference_key" ON "purchases"("reference");
CREATE INDEX "purchases_supplierId_idx" ON "purchases"("supplierId");
CREATE INDEX "purchases_status_idx" ON "purchases"("status");
CREATE INDEX "purchases_receiptStatus_idx" ON "purchases"("receiptStatus");
CREATE INDEX "purchases_paymentStatus_idx" ON "purchases"("paymentStatus");
CREATE INDEX "purchases_purchaseDate_idx" ON "purchases"("purchaseDate");
CREATE TABLE "new_suppliers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_suppliers" ("address", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt") SELECT "address", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt" FROM "suppliers";
DROP TABLE "suppliers";
ALTER TABLE "new_suppliers" RENAME TO "suppliers";
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_reference_key" ON "purchase_receipts"("reference");

-- CreateIndex
CREATE INDEX "purchase_receipts_purchaseId_idx" ON "purchase_receipts"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_receipts_receiptDate_idx" ON "purchase_receipts"("receiptDate");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_receiptId_idx" ON "purchase_receipt_items"("receiptId");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_purchaseItemId_idx" ON "purchase_receipt_items"("purchaseItemId");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_productId_idx" ON "purchase_receipt_items"("productId");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_locationId_idx" ON "purchase_receipt_items"("locationId");
