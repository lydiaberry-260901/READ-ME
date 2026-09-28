-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "healthFlagChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "morningSummary" BOOLEAN NOT NULL DEFAULT false;

