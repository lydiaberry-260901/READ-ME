// The AI's review of each new news item: is it really about the company, how relevant is it,
// what type of news is it, a one line summary and a suggested opening line.
import { z } from "zod";
import { runAiTask, AiAnswerError } from "@/lib/ai";
import { loadPrompt } from "@/lib/ai/prompts";
import { checkNoInventedNumbers } from "@/lib/outreach/ai";
import { customerGroupLabels } from "@/lib/labels";
import { redactPersonalDetails, removeDashPunctuation, truncate } from "@/lib/text";
import type { CustomerGroup, NewsType } from "@/generated/prisma/enums";

export const NEWS_REVIEW_PROMPT = { name: "news-review", version: 1 } as const;

export const newsReviewSchema = z.object({
  aboutCompany: z.boolean(),
  relevance: z.number(),
  newsType: z.enum(["FUND_RAISE", "PROPERTY_TRANSACTION", "NEW_ESG_HIRE", "BUILDING_WORK", "EPC_CRREM", "TENDER_APPOINTMENT", "NEW_RULES", "OTHER"]),
  summary: z.string(),
  openingLine: z.string(),
});

export type NewsReview = { aboutCompany: boolean; relevance: number; newsType: NewsType; summary: string; openingLine: string };

export function makeNewsChecker(sources: string) {
  return (data: unknown): NewsReview => {
    const parsed = newsReviewSchema.safeParse(data);
    if (!parsed.success) throw new AiAnswerError("The AI answer was missing required parts.");
    const a = parsed.data;
    if (!Number.isInteger(a.relevance) || a.relevance < 1 || a.relevance > 5) throw new AiAnswerError("Relevance must be a whole number from 1 to 5.");
    const summary = removeDashPunctuation(a.summary.trim());
    const openingLine = removeDashPunctuation(a.openingLine.trim());
    if (!summary || summary.split(/\s+/).length > 40) throw new AiAnswerError("The summary must be one short line.");
    if (!openingLine || openingLine.split(/\s+/).length > 40) throw new AiAnswerError("The opening line must be one short sentence.");
    checkNoInventedNumbers(summary, sources);
    checkNoInventedNumbers(openingLine, sources);
    return { aboutCompany: a.aboutCompany, relevance: a.relevance, newsType: a.newsType, summary, openingLine };
  };
}

export async function reviewNewsItem(input: {
  organisationId: string;
  company: { name: string; customerGroup: CustomerGroup | null; description: string | null };
  headline: string;
  source: string;
  description: string | null;
}) {
  const system = loadPrompt(NEWS_REVIEW_PROMPT.name, NEWS_REVIEW_PROMPT.version);
  const user = redactPersonalDetails(
    [
      `Company: ${input.company.name}`,
      input.company.customerGroup ? `Customer group: ${customerGroupLabels[input.company.customerGroup]}` : null,
      input.company.description ? `About the company: ${truncate(input.company.description, 500)}` : null,
      "",
      `Headline: ${input.headline}`,
      `Source: ${input.source}`,
      `Description: ${input.description ? truncate(input.description, 800) : "none given"}`,
    ].filter((l) => l !== null).join("\n"),
  );
  return runAiTask({
    feature: "news_review",
    promptVersion: `news-review.v${NEWS_REVIEW_PROMPT.version}`,
    organisationId: input.organisationId,
    userId: null,
    system,
    user,
    outputSchema: newsReviewSchema,
    check: makeNewsChecker(user),
    maxTokens: 1500,
  });
}
