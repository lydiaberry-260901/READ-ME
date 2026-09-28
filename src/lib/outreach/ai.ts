// AI drafts for outreach. The AI is given company facts and the contact's job title only,
// never their name or contact details: it writes placeholders that the CRM fills in afterwards.
// Answers are checked before use, including a check that no numbers were invented.
import { z } from "zod";
import { runAiTask, AiAnswerError } from "@/lib/ai";
import { fillPrompt, loadPrompt } from "@/lib/ai/prompts";
import { customerGroupLabels, outreachReasonLabels } from "@/lib/labels";
import { redactPersonalDetails, removeDashPunctuation, truncate } from "@/lib/text";
import { unknownPlaceholders } from "./merge";
import type { CustomerGroup, OutreachReason } from "@/generated/prisma/enums";

export const OUTREACH_EMAIL_PROMPT = { name: "outreach-email", version: 1 } as const;
export const CALL_SCRIPT_PROMPT = { name: "call-script", version: 1 } as const;

export const emailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  personalisationNotes: z.array(z.string()),
  missingInformation: z.array(z.string()),
});

export const scriptDraftSchema = z.object({
  opening: z.string(),
  questions: z.array(z.string()),
  objections: z.array(z.object({ objection: z.string(), response: z.string() })),
  ask: z.string(),
  missingInformation: z.array(z.string()),
});

export type OutreachFacts = {
  reason: OutreachReason;
  jobTitle: string | null;
  company: {
    name: string;
    customerGroup: CustomerGroup | null;
    whyMatters: string | null;
    scoreReason: string | null;
    description: string | null;
    portfolioSize: string | null;
    headOffice: string | null;
    keyFacts: string[];
  } | null;
  news: { headline: string; summary: string | null; publishedAt: Date | null } | null;
};

export function buildFactsText(f: OutreachFacts): string {
  const lines = [`Reason for getting in touch: ${outreachReasonLabels[f.reason]}`];
  lines.push(`Recipient's job title: ${f.jobTitle ?? "not known"}`);
  if (f.company) {
    const c = f.company;
    lines.push("", "Company facts:", `Name: use the placeholder {{company.name}} (the company is ${c.name})`);
    if (c.customerGroup) lines.push(`Customer group: ${customerGroupLabels[c.customerGroup]}`);
    if (c.whyMatters) lines.push(`Why this company matters to Moca: ${c.whyMatters}`);
    if (c.scoreReason) lines.push(`Fit: ${c.scoreReason}`);
    if (c.description) lines.push(`Description: ${c.description}`);
    if (c.portfolioSize) lines.push(`Portfolio size: ${c.portfolioSize}`);
    if (c.headOffice) lines.push(`Head office: ${c.headOffice}`);
    for (const k of c.keyFacts) lines.push(`Fact: ${k}`);
  }
  if (f.news) {
    lines.push("", "Recent news:", `Headline: ${f.news.headline}`);
    if (f.news.summary) lines.push(`Summary: ${f.news.summary}`);
  } else {
    lines.push("", "Recent news: none found. Do not refer to any news.");
  }
  return redactPersonalDetails(truncate(lines.join("\n"), 6000));
}

/** Numbers written in text, normalised so "£500,000" and "500000" match. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, "").replace(/\.0+$/, ""));
}

/** Rejects any number in the answer that does not appear in what the AI was given. */
export function checkNoInventedNumbers(answer: string, sources: string): void {
  const allowed = new Set(numbersIn(sources));
  // Suggested meeting lengths ("a 15 minute call") are proposals, not claims, so they are allowed.
  const claims = answer.replace(/\b\d{1,3}\s*(?:minute|min)s?\b/gi, " ");
  const invented = numbersIn(claims).filter((n) => !allowed.has(n));
  if (invented.length) {
    throw new AiAnswerError(`The draft contained figures that were not in the information given (${[...new Set(invented)].join(", ")}), so it may have invented them.`);
  }
}

function checkPlaceholders(text: string) {
  const unknown = unknownPlaceholders(text);
  if (unknown.length) throw new AiAnswerError(`The draft used placeholders that do not exist: ${unknown.join(", ")}.`);
}

function checkNoFooter(text: string) {
  if (/unsubscribe|privacy notice/i.test(text)) throw new AiAnswerError("The draft added its own unsubscribe or privacy text, which the CRM adds itself.");
}

export function makeEmailChecker(sources: string, templateBody: string) {
  return (data: unknown) => {
    const parsed = emailDraftSchema.safeParse(data);
    if (!parsed.success) throw new AiAnswerError("The AI answer was missing required parts.");
    const subject = removeDashPunctuation(parsed.data.subject.replace(/\s+/g, " ").trim());
    const body = removeDashPunctuation(parsed.data.body.trim()).replace(/[ \t]+\n/g, "\n");
    if (!subject || subject.length > 150) throw new AiAnswerError("The subject line was empty or too long.");
    if (body.length < 40) throw new AiAnswerError("The email body was too short.");
    if (body.length > templateBody.length + 600) throw new AiAnswerError("The email was much longer than the template.");
    for (const t of [subject, body]) {
      checkPlaceholders(t);
      checkNoInventedNumbers(t, sources);
    }
    checkNoFooter(body);
    return {
      subject,
      body,
      personalisationNotes: parsed.data.personalisationNotes.slice(0, 8),
      missingInformation: parsed.data.missingInformation.slice(0, 8),
    };
  };
}

export function makeScriptChecker(sources: string) {
  return (data: unknown) => {
    const parsed = scriptDraftSchema.safeParse(data);
    if (!parsed.success) throw new AiAnswerError("The AI answer was missing required parts.");
    const a = parsed.data;
    if (a.questions.length !== 3) throw new AiAnswerError("The script must have exactly three questions.");
    if (a.objections.length < 2 || a.objections.length > 4) throw new AiAnswerError("The script must have two to four objections.");
    const clean = {
      opening: removeDashPunctuation(a.opening.trim()),
      questions: a.questions.map((q) => removeDashPunctuation(q.trim())),
      objections: a.objections.map((o) => ({ objection: removeDashPunctuation(o.objection.trim()), response: removeDashPunctuation(o.response.trim()) })),
      ask: removeDashPunctuation(a.ask.trim()),
      missingInformation: a.missingInformation.slice(0, 8),
    };
    const all = [clean.opening, ...clean.questions, ...clean.objections.flatMap((o) => [o.objection, o.response]), clean.ask];
    if (all.some((t) => !t)) throw new AiAnswerError("Part of the script was empty.");
    for (const t of all) {
      checkPlaceholders(t);
      checkNoInventedNumbers(t, sources);
    }
    return clean;
  };
}

export async function draftEmailWithAi(input: {
  organisationId: string;
  userId: string;
  facts: OutreachFacts;
  template: { subject: string; body: string };
  businessContext: string;
}) {
  const promptText = loadPrompt(OUTREACH_EMAIL_PROMPT.name, OUTREACH_EMAIL_PROMPT.version);
  const system = fillPrompt(promptText, { businessContext: input.businessContext || "No documents have been added yet." });
  const facts = buildFactsText(input.facts);
  const user = `<template>\nSubject: ${input.template.subject}\n\n${input.template.body}\n</template>\n\n<facts>\n${facts}\n</facts>`;
  const sources = [system, user].join("\n");
  return runAiTask({
    feature: "outreach_email",
    promptVersion: `outreach-email.v${OUTREACH_EMAIL_PROMPT.version}`,
    organisationId: input.organisationId,
    userId: input.userId,
    system,
    user,
    outputSchema: emailDraftSchema,
    check: makeEmailChecker(sources, input.template.body),
  });
}

export async function draftScriptWithAi(input: {
  organisationId: string;
  userId: string;
  facts: OutreachFacts;
  script: { opening: string; questions: string[]; objections: { objection: string; response: string }[]; ask: string };
  businessContext: string;
}) {
  const promptText = loadPrompt(CALL_SCRIPT_PROMPT.name, CALL_SCRIPT_PROMPT.version);
  const system = fillPrompt(promptText, { businessContext: input.businessContext || "No documents have been added yet." });
  const s = input.script;
  const starting = [
    `Opening: ${s.opening}`,
    ...s.questions.map((q, i) => `Question ${i + 1}: ${q}`),
    ...s.objections.map((o) => `Objection: ${o.objection} Reply: ${o.response}`),
    `Ask: ${s.ask}`,
  ].join("\n");
  const user = `<starting_script>\n${starting}\n</starting_script>\n\n<facts>\n${buildFactsText(input.facts)}\n</facts>`;
  const sources = [system, user].join("\n");
  return runAiTask({
    feature: "call_script",
    promptVersion: `call-script.v${CALL_SCRIPT_PROMPT.version}`,
    organisationId: input.organisationId,
    userId: input.userId,
    system,
    user,
    outputSchema: scriptDraftSchema,
    check: makeScriptChecker(sources),
  });
}
