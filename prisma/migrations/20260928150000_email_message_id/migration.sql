-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "internetMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Email_organisationId_internetMessageId_key" ON "Email"("organisationId", "internetMessageId");

