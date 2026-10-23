-- AlterTable
ALTER TABLE "TransactionLink" ADD COLUMN     "rate" DECIMAL(18,8),
ADD COLUMN     "rateDate" TEXT,
ADD COLUMN     "rateSource" TEXT;
