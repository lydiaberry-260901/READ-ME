-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'OBJECTION', 'PORTABILITY');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'REFUSED');

-- CreateEnum
CREATE TYPE "BreachStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "BreachRisk" AS ENUM ('UNKNOWN', 'UNLIKELY', 'RISK', 'HIGH_RISK');

-- CreateEnum
CREATE TYPE "IcoDecision" AS ENUM ('NOT_DECIDED', 'REPORTED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "RetentionStatus" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "dpiaReviewDate" DATE,
ADD COLUMN     "icoFeeRenewalDate" DATE,
ADD COLUMN     "legitimateInterestsAssessment" JSONB,
ADD COLUMN     "privacyChecklist" JSONB;

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT,
    "details" TEXT,
    "contactId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "extendedDueAt" TIMESTAMP(3),
    "extensionReason" TEXT,
    "identityCheckedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "outcome" TEXT,
    "completedAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Breach" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "reportedById" TEXT,
    "status" "BreachStatus" NOT NULL DEFAULT 'OPEN',
    "dataInvolved" TEXT,
    "peopleAffected" INTEGER,
    "risk" "BreachRisk" NOT NULL DEFAULT 'UNKNOWN',
    "riskReason" TEXT,
    "icoDecision" "IcoDecision" NOT NULL DEFAULT 'NOT_DECIDED',
    "icoDecisionReason" TEXT,
    "icoReportedAt" TIMESTAMP(3),
    "icoReference" TEXT,
    "peopleToldAt" TIMESTAMP(3),
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "actionsTaken" TEXT,
    "lessons" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Breach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataShared" TEXT NOT NULL,
    "location" TEXT,
    "outsideUk" BOOLEAN,
    "safeguards" TEXT,
    "dpaInPlace" BOOLEAN NOT NULL DEFAULT false,
    "dpaDate" DATE,
    "noTraining" BOOLEAN,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionReview" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "status" "RetentionStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataRequest_organisationId_status_dueAt_idx" ON "DataRequest"("organisationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Breach_organisationId_status_idx" ON "Breach"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organisationId_name_key" ON "Supplier"("organisationId", "name");

-- CreateIndex
CREATE INDEX "RetentionReview_organisationId_status_idx" ON "RetentionReview"("organisationId", "status");

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breach" ADD CONSTRAINT "Breach_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breach" ADD CONSTRAINT "Breach_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionReview" ADD CONSTRAINT "RetentionReview_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionReview" ADD CONSTRAINT "RetentionReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

