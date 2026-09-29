-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoStepEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoStepFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "twoStepLastStep" INTEGER,
ADD COLUMN     "twoStepLockedUntil" TIMESTAMP(3),
ADD COLUMN     "twoStepRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoStepSecretEnc" TEXT;

-- CreateTable
CREATE TABLE "TwoStepSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoStepSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TwoStepSession_userId_idx" ON "TwoStepSession"("userId");

-- AddForeignKey
ALTER TABLE "TwoStepSession" ADD CONSTRAINT "TwoStepSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

