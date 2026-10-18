-- AlterTable deliveries
ALTER TABLE "deliveries" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'home_delivery';
ALTER TABLE "deliveries" ADD COLUMN "recipientName" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "carrierName" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "deliveredAt" DATETIME;

-- AlterTable shop_settings
ALTER TABLE "shop_settings" ADD COLUMN "nis" TEXT;
ALTER TABLE "shop_settings" ADD COLUMN "legalForm" TEXT;
