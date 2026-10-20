-- AlterTable
ALTER TABLE "sales" ADD COLUMN "includeDeliveryFee" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE IF EXISTS "deliveries";
