-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "stockAfter" INTEGER;
ALTER TABLE "stock_movements" ADD COLUMN "stockBefore" INTEGER;

-- CreateIndex
CREATE INDEX "stock_movements_reference_idx" ON "stock_movements"("reference");
