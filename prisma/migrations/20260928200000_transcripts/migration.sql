-- AlterTable
ALTER TABLE "CallTranscript" ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "transcriptWebhookCreatedAt" TIMESTAMP(3),
ADD COLUMN     "transcriptWebhookKeyHash" TEXT,
ADD COLUMN     "transcriptWebhookKeyHint" TEXT;

