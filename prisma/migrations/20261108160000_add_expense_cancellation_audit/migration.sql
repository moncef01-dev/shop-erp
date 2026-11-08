-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "expenses" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "expenses" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "expenses" ADD COLUMN "cancelledBy" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses"("status");

