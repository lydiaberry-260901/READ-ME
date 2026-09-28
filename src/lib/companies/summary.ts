// "Why this company matters to Moca": AI written summary, score and reason.
// Only company information is sent to the AI, never details about individual people.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAiTask, AiAnswerError } from "@/lib/ai";
import { fillPrompt, loadPrompt } from "@/lib/ai/prompts";
import { countSentences, redactPersonalDetails, removeDashPunctuation, truncate } from "@/lib/text";
import { customerGroupLabels } from "@/lib/labels";
import type { CustomerGroup } from "@/generated/prisma/enums";
import type { CompanyEnrichment } from "@/lib/enrichment/types";

export const COMPANY_SUMMARY_PROMPT = { name: "company-summary", version: 1 } as const;
export const SCORING_GUIDE = { name: "scoring-guide", version: 1 } as const;
export const COMPANY_SUMMARY_PROMPT_VERSION = `company-summary.v${COMPANY_SUMMARY_PROMPT.version}+scoring-guide.v${SCORING_GUIDE.version}`;

// The shape the AI is asked to answer in.
export const companySummaryOutputSchema = z.object({
  summary: z.string(),
  score: z.number(),
  scoreReason: z.string(),
  suggestedCustomerGroup: z.enum(["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", "UNSURE"]),
  keyFacts: z.array(z.string()),
  missingInformation: z.array(z.string()),
});

export type CompanySummaryResult = {
  summary: string;
  score: number;
  scoreReason: string;
  suggestedCustomerGroup: CustomerGroup | null;
  keyFacts: string[];
  missingInformation: string[];
};

/** Stricter checks on the AI answer before anything is saved. Throws AiAnswerError if any rule is broken. */
export function checkCompanySummary(data: unknown): CompanySummaryResult {
  const parsed = companySummaryOutputSchema.safeParse(data);
  if (!parsed.success) throw new AiAnswerError("The AI answer was missing required parts.");
  const a = parsed.data;

  const summary = removeDashPunctuation(a.summary.trim());
  const sentences = countSentences(summary);
  if (sentences < 2 || sentences > 3) throw new AiAnswerError(`The summary must be 2 or 3 sentences, but had ${sentences}.`);
  if (summary.length > 700) throw new AiAnswerError("The summary was too long.");

  if (!Number.isInteger(a.score) || a.score < 1 || a.score > 5) throw new AiAnswerError("The score must be a whole number from 1 to 5.");

  const scoreReason = removeDashPunctuation(a.scoreReason.trim().replace(/\s+/g, " "));
  if (!scoreReason) throw new AiAnswerError("The score reason was empty.");
  if (scoreReason.length > 220 || scoreReason.includes("\n")) throw new AiAnswerError("The score reason must be one short line.");

  return {
    summary,
    score: a.score,
    scoreReason,
    suggestedCustomerGroup: a.suggestedCustomerGroup === "UNSURE" ? null : a.suggestedCustomerGroup,
    keyFacts: a.keyFacts.map((f) => removeDashPunctuation(f.trim())).filter(Boolean).slice(0, 6),
    missingInformation: a.missingInformation.map((m) => m.trim()).filter(Boolean).slice(0, 6),
  };
}

type CompanyForAi = {
  name: string;
  alternativeNames: string[];
  website: string | null;
  customerGroup: CustomerGroup | null;
  description: string | null;
  portfolioSize: string | null;
  headOffice: string | null;
  companiesHouseNumber: string | null;
  enrichment: unknown;
};

/** Builds the company information sent to the AI. Company facts only, with any email addresses or phone numbers removed. */
export function buildCompanyInput(company: CompanyForAi): string {
  const enrichment = (company.enrichment ?? {}) as CompanyEnrichment;
  const lines: string[] = [`Company name: ${company.name}`];
  if (company.alternativeNames.length) lines.push(`Also known as: ${company.alternativeNames.join(", ")}`);
  if (company.website) lines.push(`Website: ${company.website}`);
  if (company.customerGroup) lines.push(`Customer group recorded by the sales team: ${customerGroupLabels[company.customerGroup]}`);
  if (company.description) lines.push(`Description recorded by the sales team: ${company.description}`);
  if (company.portfolioSize) lines.push(`Portfolio size: ${company.portfolioSize}`);
  if (company.headOffice) lines.push(`Head office: ${company.headOffice}`);
  if (company.companiesHouseNumber) lines.push(`Companies House number: ${company.companiesHouseNumber}`);

  const ch = enrichment.companiesHouse;
  if (ch?.status === "ok") {
    lines.push("", "From Companies House:");
    if (ch.companyName) lines.push(`Registered name: ${ch.companyName}`);
    if (ch.companyStatus) lines.push(`Status: ${ch.companyStatus}`);
    if (ch.companyType) lines.push(`Type: ${ch.companyType}`);
    if (ch.incorporatedOn) lines.push(`Incorporated: ${ch.incorporatedOn}`);
    if (ch.sicCodes?.length) lines.push(`Industry codes (SIC): ${ch.sicCodes.join(", ")}`);
    if (ch.registeredOffice) lines.push(`Registered office: ${ch.registeredOffice}`);
  }
  const web = enrichment.website;
  if (web?.status === "ok") {
    lines.push("", "From the company's own website home page:");
    if (web.title) lines.push(`Page title: ${web.title}`);
    if (web.description) lines.push(`Page description: ${web.description}`);
    if (web.textExcerpt) lines.push(`Text excerpt: ${web.textExcerpt}`);
  }
  return redactPersonalDetails(truncate(lines.join("\n"), 8000));
}

export function buildCompanySummaryPrompts(company: CompanyForAi) {
  const system = fillPrompt(loadPrompt(COMPANY_SUMMARY_PROMPT.name, COMPANY_SUMMARY_PROMPT.version), {
    scoringGuide: loadPrompt(SCORING_GUIDE.name, SCORING_GUIDE.version),
  });
  const user = `Here is everything we know about the company. Write the note and score using only this.\n\n<company_information>\n${buildCompanyInput(company)}\n</company_information>`;
  return { system, user };
}

/** Generates and saves the summary. The caller must already have checked the person may edit the company. */
export async function generateCompanySummary(companyId: string, organisationId: string, userId: string | null) {
  const company = await prisma.company.findFirstOrThrow({ where: { id: companyId, organisationId } });
  const { system, user } = buildCompanySummaryPrompts(company);

  const { result, model } = await runAiTask({
    feature: "company_summary",
    promptVersion: COMPANY_SUMMARY_PROMPT_VERSION,
    organisationId,
    userId,
    system,
    user,
    outputSchema: companySummaryOutputSchema,
    check: checkCompanySummary,
  });

  const updated = await prisma.company.update({
    where: { id: companyId },
    data: {
      whyMatters: result.summary,
      score: result.score,
      scoreReason: result.scoreReason,
      aiSuggestedGroup: result.suggestedCustomerGroup,
      aiKeyFacts: { keyFacts: result.keyFacts, missingInformation: result.missingInformation, promptVersion: COMPANY_SUMMARY_PROMPT_VERSION },
      aiModel: model,
      aiGeneratedAt: new Date(),
      aiEditedAt: null,
      aiEditedById: null,
    },
  });
  await prisma.auditLog.create({
    data: {
      organisationId,
      userId,
      action: "company.ai_summary_generated",
      entityType: "Company",
      entityId: companyId,
      details: { model, score: result.score, promptVersion: COMPANY_SUMMARY_PROMPT_VERSION },
    },
  });
  return updated;
}
