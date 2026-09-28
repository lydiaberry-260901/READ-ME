-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'REP');

-- CreateEnum
CREATE TYPE "CustomerGroup" AS ENUM ('ASSET_ESG', 'PROPERTY_MANAGER', 'OCCUPIER');

-- CreateEnum
CREATE TYPE "LawfulBasis" AS ENUM ('LEGITIMATE_INTERESTS', 'CONSENT', 'CONTRACT');

-- CreateEnum
CREATE TYPE "ContactEntityType" AS ENUM ('LIMITED_COMPANY', 'PUBLIC_BODY', 'LLP', 'SOLE_TRADER', 'PARTNERSHIP', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PhoneRegisterResult" AS ENUM ('CLEAR', 'LISTED');

-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "HealthFlag" AS ENUM ('ON_TRACK', 'AT_RISK', 'STALLED');

-- CreateEnum
CREATE TYPE "LossReason" AS ENUM ('BUDGET', 'TIMING', 'NO_DECISION', 'LOST_TO_COMPETITOR', 'NO_ECONOMIC_BUYER', 'PRODUCT_FIT', 'OTHER');

-- CreateEnum
CREATE TYPE "StakeholderRole" AS ENUM ('CHAMPION', 'ECONOMIC_BUYER', 'BLOCKER', 'INFLUENCER', 'USER');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CALL', 'EMAIL', 'FOLLOW_UP', 'RESEARCH', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'SNOOZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('MANUAL', 'RULE', 'NEWS', 'TRANSCRIPT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE');

-- CreateEnum
CREATE TYPE "CallResult" AS ENUM ('CONNECTED', 'NO_ANSWER', 'VOICEMAIL', 'WRONG_NUMBER');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('SENT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "OutreachReason" AS ENUM ('EPC_RISK', 'NET_ZERO', 'NEW_ESG_HIRE', 'TENDER', 'ACQUISITION', 'GENERAL_INTRO');

-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('PASTE', 'UPLOAD', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'NEEDS_MATCHING');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('INTERESTED', 'SEND_INFORMATION', 'CALL_BACK_LATER', 'MEETING_BOOKED', 'NOT_NOW', 'WRONG_PERSON', 'NOT_INTERESTED');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('STAGE_CHANGE', 'QUALIFICATION_FIELD');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NewsFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "NewsType" AS ENUM ('FUND_RAISE', 'PROPERTY_TRANSACTION', 'NEW_ESG_HIRE', 'BUILDING_WORK', 'EPC_CRREM', 'TENDER_APPOINTMENT', 'NEW_RULES', 'OTHER');

-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('NEW', 'READ', 'ACTED_ON');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DEAL_STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST', 'MORNING_SUMMARY', 'INVITATION', 'PRIVACY_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "singleThreadedDays" INTEGER NOT NULL DEFAULT 14,
    "dailyTaskLimit" INTEGER NOT NULL DEFAULT 25,
    "phoneCheckMaxAgeDays" INTEGER NOT NULL DEFAULT 28,
    "retainContactsMonths" INTEGER NOT NULL DEFAULT 24,
    "retainTranscriptsMonths" INTEGER NOT NULL DEFAULT 12,
    "retainNewsMonths" INTEGER NOT NULL DEFAULT 12,
    "privacyNoticeUrl" TEXT,
    "dataProtectionLeadId" TEXT,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'REP',
    "teamId" TEXT,
    "jobTitle" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'REP',
    "teamId" TEXT,
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alternativeNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "website" TEXT,
    "domain" TEXT,
    "customerGroup" "CustomerGroup",
    "importance" INTEGER NOT NULL DEFAULT 2,
    "description" TEXT,
    "portfolioSize" TEXT,
    "headOffice" TEXT,
    "companiesHouseNumber" TEXT,
    "ownerId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "whyMatters" TEXT,
    "score" INTEGER,
    "scoreReason" TEXT,
    "aiSuggestedGroup" "CustomerGroup",
    "aiKeyFacts" JSONB,
    "aiModel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "aiEditedAt" TIMESTAMP(3),
    "aiEditedById" TEXT,
    "enrichment" JSONB,
    "enrichedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "emailNormalised" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "ownerId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lawfulBasis" "LawfulBasis" NOT NULL DEFAULT 'LEGITIMATE_INTERESTS',
    "source" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "privacyNoticeSentAt" TIMESTAMP(3),
    "entityType" "ContactEntityType" NOT NULL DEFAULT 'UNKNOWN',
    "consentAt" TIMESTAMP(3),
    "phoneCheckedAt" TIMESTAMP(3),
    "phoneCheckResult" "PhoneRegisterResult",
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "doNotContactReason" TEXT,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '#D9CFC4',
    "kind" "StageKind" NOT NULL DEFAULT 'OPEN',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "noActivityDays" INTEGER NOT NULL DEFAULT 14,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "customerGroup" "CustomerGroup",
    "expectedCloseDate" DATE,
    "nextStep" TEXT,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "metric" TEXT,
    "economicBuyer" TEXT,
    "decisionCriteria" TEXT,
    "decisionProcess" TEXT,
    "paperProcess" TEXT,
    "identifiedPain" TEXT,
    "champion" TEXT,
    "competition" TEXT,
    "qualificationPct" INTEGER NOT NULL DEFAULT 0,
    "healthScore" INTEGER,
    "healthFlag" "HealthFlag",
    "healthCalculatedAt" TIMESTAMP(3),
    "singleThreadedSince" TIMESTAMP(3),
    "singleThreadedWarnedAt" TIMESTAMP(3),
    "competitor" TEXT,
    "lossReason" "LossReason",
    "closeNote" TEXT,
    "finalValue" INTEGER,
    "closedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageHistory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "movedById" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "secondsInPreviousStage" INTEGER,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealContact" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "StakeholderRole",
    "engaged" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealFollower" (
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DealFollower_pkey" PRIMARY KEY ("dealId","userId")
);

-- CreateTable
CREATE TABLE "Battlecard" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "comparison" TEXT NOT NULL,
    "objections" JSONB NOT NULL DEFAULT '[]',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Battlecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskType" NOT NULL DEFAULT 'OTHER',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reason" TEXT,
    "origin" "TaskOrigin" NOT NULL DEFAULT 'MANUAL',
    "dedupeKey" TEXT,
    "suggestedAction" TEXT,
    "draftMessage" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "newsItemId" TEXT,
    "transcriptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "userId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" TEXT,
    "body" TEXT,
    "callResult" "CallResult",
    "durationSeconds" INTEGER,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "emailId" TEXT,
    "calendarEventId" TEXT,
    "transcriptId" TEXT,
    "emailTemplateId" TEXT,
    "callScriptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "emailAccountId" TEXT,
    "userId" TEXT,
    "providerMessageId" TEXT,
    "threadId" TEXT,
    "direction" "EmailDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "snippet" TEXT,
    "bodyText" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "isFirstContact" BOOLEAN NOT NULL DEFAULT false,
    "emailTemplateId" TEXT,
    "repliedAt" TIMESTAMP(3),
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "calendarAccountId" TEXT,
    "userId" TEXT NOT NULL,
    "providerEventId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "meetingUrl" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerGroup" "CustomerGroup",
    "reason" "OutreachReason" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isMarketing" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallScript" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerGroup" "CustomerGroup",
    "reason" "OutreachReason" NOT NULL,
    "opening" TEXT NOT NULL,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "objections" JSONB NOT NULL DEFAULT '[]',
    "ask" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTranscript" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "source" "TranscriptSource" NOT NULL,
    "externalId" TEXT,
    "text" TEXT NOT NULL,
    "callAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "uploadedById" TEXT,
    "recordingNoticeGiven" BOOLEAN,
    "recordingNoticeDetail" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "dealId" TEXT,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'NEEDS_MATCHING',
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "CallOutcome",
    "summary" TEXT,
    "promises" JSONB,
    "objections" JSONB,
    "nextStep" TEXT,
    "aiResult" JSONB,
    "aiModel" TEXT,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSuggestion" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "field" TEXT,
    "proposedValue" TEXT NOT NULL,
    "currentValue" TEXT,
    "evidence" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsWatch" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "frequency" "NewsFrequency" NOT NULL DEFAULT 'WEEKLY',
    "searchTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "NewsWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "summary" TEXT,
    "newsType" "NewsType",
    "relevance" INTEGER,
    "openingLine" TEXT,
    "aiModel" TEXT,
    "status" "NewsStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipientUserId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "payload" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "emailHash" TEXT,
    "phoneHash" TEXT,
    "hint" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_organisationId_name_key" ON "Team"("organisationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_organisationId_email_idx" ON "Invitation"("organisationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Company_organisationId_domain_idx" ON "Company"("organisationId", "domain");

-- CreateIndex
CREATE INDEX "Company_organisationId_name_idx" ON "Company"("organisationId", "name");

-- CreateIndex
CREATE INDEX "Company_organisationId_ownerId_idx" ON "Company"("organisationId", "ownerId");

-- CreateIndex
CREATE INDEX "Company_organisationId_score_idx" ON "Company"("organisationId", "score");

-- CreateIndex
CREATE INDEX "Contact_organisationId_emailNormalised_idx" ON "Contact"("organisationId", "emailNormalised");

-- CreateIndex
CREATE INDEX "Contact_organisationId_companyId_idx" ON "Contact"("organisationId", "companyId");

-- CreateIndex
CREATE INDEX "Contact_organisationId_ownerId_idx" ON "Contact"("organisationId", "ownerId");

-- CreateIndex
CREATE INDEX "Stage_pipelineId_position_idx" ON "Stage"("pipelineId", "position");

-- CreateIndex
CREATE INDEX "Deal_organisationId_stageId_idx" ON "Deal"("organisationId", "stageId");

-- CreateIndex
CREATE INDEX "Deal_organisationId_ownerId_idx" ON "Deal"("organisationId", "ownerId");

-- CreateIndex
CREATE INDEX "Deal_organisationId_healthFlag_idx" ON "Deal"("organisationId", "healthFlag");

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_movedAt_idx" ON "DealStageHistory"("dealId", "movedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealContact_dealId_contactId_key" ON "DealContact"("dealId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Battlecard_organisationId_competitorName_key" ON "Battlecard"("organisationId", "competitorName");

-- CreateIndex
CREATE INDEX "Task_organisationId_assigneeId_status_dueAt_idx" ON "Task"("organisationId", "assigneeId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_organisationId_dedupeKey_key" ON "Task"("organisationId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_emailId_key" ON "Activity"("emailId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_calendarEventId_key" ON "Activity"("calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_transcriptId_key" ON "Activity"("transcriptId");

-- CreateIndex
CREATE INDEX "Activity_organisationId_occurredAt_idx" ON "Activity"("organisationId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_organisationId_dealId_idx" ON "Activity"("organisationId", "dealId");

-- CreateIndex
CREATE INDEX "Activity_organisationId_contactId_idx" ON "Activity"("organisationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_userId_provider_emailAddress_key" ON "EmailAccount"("userId", "provider", "emailAddress");

-- CreateIndex
CREATE INDEX "Email_organisationId_contactId_idx" ON "Email"("organisationId", "contactId");

-- CreateIndex
CREATE INDEX "Email_organisationId_threadId_idx" ON "Email"("organisationId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Email_emailAccountId_providerMessageId_key" ON "Email"("emailAccountId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarAccount_userId_provider_emailAddress_key" ON "CalendarAccount"("userId", "provider", "emailAddress");

-- CreateIndex
CREATE INDEX "CalendarEvent_organisationId_userId_startAt_idx" ON "CalendarEvent"("organisationId", "userId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_calendarAccountId_providerEventId_key" ON "CalendarEvent"("calendarAccountId", "providerEventId");

-- CreateIndex
CREATE INDEX "EmailTemplate_organisationId_customerGroup_reason_idx" ON "EmailTemplate"("organisationId", "customerGroup", "reason");

-- CreateIndex
CREATE INDEX "CallScript_organisationId_customerGroup_reason_idx" ON "CallScript"("organisationId", "customerGroup", "reason");

-- CreateIndex
CREATE INDEX "CallTranscript_organisationId_dealId_idx" ON "CallTranscript"("organisationId", "dealId");

-- CreateIndex
CREATE INDEX "CallTranscript_organisationId_contactId_idx" ON "CallTranscript"("organisationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CallTranscript_organisationId_externalId_key" ON "CallTranscript"("organisationId", "externalId");

-- CreateIndex
CREATE INDEX "TranscriptSuggestion_dealId_status_idx" ON "TranscriptSuggestion"("dealId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NewsWatch_companyId_key" ON "NewsWatch"("companyId");

-- CreateIndex
CREATE INDEX "NewsItem_organisationId_publishedAt_idx" ON "NewsItem"("organisationId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_organisationId_companyId_urlHash_key" ON "NewsItem"("organisationId", "companyId", "urlHash");

-- CreateIndex
CREATE INDEX "Notification_organisationId_status_idx" ON "Notification"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organisationId_dedupeKey_key" ON "Notification"("organisationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AuditLog_organisationId_createdAt_idx" ON "AuditLog"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organisationId_entityType_entityId_idx" ON "AuditLog"("organisationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_organisationId_emailHash_key" ON "Suppression"("organisationId", "emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_organisationId_phoneHash_key" ON "Suppression"("organisationId", "phoneHash");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealFollower" ADD CONSTRAINT "DealFollower_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealFollower" ADD CONSTRAINT "DealFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battlecard" ADD CONSTRAINT "Battlecard_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battlecard" ADD CONSTRAINT "Battlecard_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "CallTranscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "CallTranscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_callScriptId_fkey" FOREIGN KEY ("callScriptId") REFERENCES "CallScript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAccount" ADD CONSTRAINT "CalendarAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarAccountId_fkey" FOREIGN KEY ("calendarAccountId") REFERENCES "CalendarAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallScript" ADD CONSTRAINT "CallScript_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTranscript" ADD CONSTRAINT "CallTranscript_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSuggestion" ADD CONSTRAINT "TranscriptSuggestion_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "CallTranscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSuggestion" ADD CONSTRAINT "TranscriptSuggestion_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSuggestion" ADD CONSTRAINT "TranscriptSuggestion_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsWatch" ADD CONSTRAINT "NewsWatch_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsWatch" ADD CONSTRAINT "NewsWatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
