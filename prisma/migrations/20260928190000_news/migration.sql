-- AlterTable
ALTER TABLE "NewsItem" ADD COLUMN     "headlineKey" TEXT,
ADD COLUMN     "reviewText" TEXT;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "newsDailyCallLimit" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "newsFeeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "newsLastRunAt" TIMESTAMP(3),
ADD COLUMN     "newsLastRunSummary" JSONB,
ADD COLUMN     "newsSource" TEXT NOT NULL DEFAULT 'OFF';

