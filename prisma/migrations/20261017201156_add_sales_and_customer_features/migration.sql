-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_customers" (
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
INSERT INTO "new_customers" ("address", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt") SELECT "address", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt" FROM "customers";
DROP TABLE "customers";
ALTER TABLE "new_customers" RENAME TO "customers";
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");
CREATE TABLE "new_deliveries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "saleId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fee" REAL NOT NULL DEFAULT 0,
    "deliveryDate" DATETIME,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "deliveries_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_deliveries" ("address", "createdAt", "deliveryDate", "id", "notes", "reference", "saleId", "status", "updatedAt") SELECT "address", "createdAt", "deliveryDate", "id", "notes", "reference", "saleId", "status", "updatedAt" FROM "deliveries";
DROP TABLE "deliveries";
ALTER TABLE "new_deliveries" RENAME TO "deliveries";
CREATE UNIQUE INDEX "deliveries_reference_key" ON "deliveries"("reference");
CREATE INDEX "deliveries_saleId_idx" ON "deliveries"("saleId");
CREATE TABLE "new_sale_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "saleId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "subtotal" REAL NOT NULL,
    CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_sale_items" ("discount", "id", "productId", "quantity", "saleId", "subtotal", "unitPrice") SELECT "discount", "id", "productId", "quantity", "saleId", "subtotal", "unitPrice" FROM "sale_items";
DROP TABLE "sale_items";
ALTER TABLE "new_sale_items" RENAME TO "sale_items";
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX "sale_items_productId_idx" ON "sale_items"("productId");
CREATE INDEX "sale_items_locationId_idx" ON "sale_items"("locationId");
CREATE TABLE "new_sales" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reference" TEXT NOT NULL,
    "customerId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "deliveryFee" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'none',
    "notes" TEXT,
    "saleDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_sales" ("createdAt", "customerId", "id", "notes", "paidAmount", "reference", "saleDate", "status", "totalAmount", "updatedAt") SELECT "createdAt", "customerId", "id", "notes", "paidAmount", "reference", "saleDate", "status", "totalAmount", "updatedAt" FROM "sales";
DROP TABLE "sales";
ALTER TABLE "new_sales" RENAME TO "sales";
CREATE UNIQUE INDEX "sales_reference_key" ON "sales"("reference");
CREATE INDEX "sales_customerId_idx" ON "sales"("customerId");
CREATE INDEX "sales_status_idx" ON "sales"("status");
CREATE INDEX "sales_paymentStatus_idx" ON "sales"("paymentStatus");
CREATE INDEX "sales_saleDate_idx" ON "sales"("saleDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
