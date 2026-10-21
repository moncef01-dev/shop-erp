-- AlterTable cash_sessions
ALTER TABLE "cash_sessions" ADD COLUMN "originalClosingAmount" REAL;
ALTER TABLE "cash_sessions" ADD COLUMN "originalTheoreticalAmount" REAL;
ALTER TABLE "cash_sessions" ADD COLUMN "originalDifference" REAL;
ALTER TABLE "cash_sessions" ADD COLUMN "retainedAmount" REAL;
ALTER TABLE "cash_sessions" ADD COLUMN "closingEditAudit" TEXT;

-- AlterTable treasury_transfers
ALTER TABLE "treasury_transfers" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE "treasury_transfers" ADD COLUMN "editHistory" TEXT;
