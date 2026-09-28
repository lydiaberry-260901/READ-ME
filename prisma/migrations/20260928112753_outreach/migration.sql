-- CreateEnum
CREATE TYPE "DraftKind" AS ENUM ('EMAIL', 'CALL_SCRIPT');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'DISCARDED');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "postalAddress" TEXT,
ADD COLUMN     "websiteUrl" TEXT DEFAULT 'https://moca.energy';

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DraftKind" NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "emailTemplateId" TEXT,
    "callScriptId" TEXT,
    "isMarketing" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "body" TEXT,
    "opening" TEXT,
    "questions" JSONB,
    "objections" JSONB,
    "ask" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiModel" TEXT,
    "aiNotes" JSONB,
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachDraft_organisationId_userId_status_idx" ON "OutreachDraft"("organisationId", "userId", "status");

-- CreateIndex
CREATE INDEX "OutreachDraft_organisationId_contactId_idx" ON "OutreachDraft"("organisationId", "contactId");

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_callScriptId_fkey" FOREIGN KEY ("callScriptId") REFERENCES "CallScript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
