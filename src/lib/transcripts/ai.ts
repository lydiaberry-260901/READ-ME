// The AI's reading of a call transcript. Everything it returns is a suggestion for a person to
// review: deal changes are saved as suggestions to approve one by one, never applied directly.
import { z } from "zod";
import { AiAnswerError } from "@/lib/ai";
import { checkNoInventedNumbers } from "@/lib/outreach/ai";
import { QUALIFICATION_FIELDS, type QualificationKey } from "@/lib/qualification";
import { countSentences, removeDashPunctuation } from "@/lib/text";
import type { CallOutcome, TaskType } from "@/generated/prisma/enums";

export const TRANSCRIPT_PROMPT = { name: "call-transcript", version: 1 } as const;

const qualificationKeys = QUALIFICATION_FIELDS.map((f) => f.key) as [QualificationKey, ...QualificationKey[]];

export const transcriptOutputSchema = z.object({
  outcome: z.enum(["INTERESTED", "SEND_INFORMATION", "CALL_BACK_LATER", "MEETING_BOOKED", "NOT_NOW", "WRONG_PERSON", "NOT_INTERESTED"]),
  summary: z.string(),
  promises: z.array(z.object({ text: z.string(), dueDate: z.string().nullable(), byWhom: z.enum(["US", "THEM"]) })),
  objections: z.array(z.object({ objection: z.string(), howHandled: z.string().nullable() })),
  nextStep: z.string().nullable(),
  qualification: z.array(z.object({ field: z.enum(qualificationKeys), value: z.string(), evidence: z.string() })),
  suggestedStage: z.object({ stageName: z.string(), reason: z.string(), evidence: z.string() }).nullable(),
  followUps: z.array(
    z.object({
      title: z.string(),
      type: z.enum(["CALL", "EMAIL", "MEETING", "FOLLOW_UP", "OTHER"]),
      dueDate: z.string().nullable(),
      reason: z.string(),
      draftMessage: z.string().nullable(),
    }),
  ),
  recordingNotice: z.object({ mentioned: z.boolean(), evidence: z.string().nullable() }),
});

export type TranscriptReading = {
  outcome: CallOutcome;
  summary: string;
  promises: { text: string; dueDate: string | null; byWhom: "US" | "THEM" }[];
  objections: { objection: string; howHandled: string | null }[];
  nextStep: string | null;
  qualification: { field: QualificationKey; value: string; evidence: string }[];
  suggestedStage: { stageName: string; reason: string; evidence: string } | null;
  followUps: { title: string; type: TaskType; dueDate: string | null; reason: string; draftMessage: string | null }[];
  recordingNotice: { mentioned: boolean; evidence: string | null };
  /** Things the checks removed, shown to the person so nothing disappears silently. */
  dropped: string[];
};

const squash = (s: string) => s.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[^\p{L}\p{N}£%]+/gu, " ").trim();

/** True when the quoted words really appear in the transcript (ignoring case, spacing and punctuation). */
export function evidenceFound(evidence: string, transcript: string) {
  const e = squash(evidence);
  return e.length >= 4 && squash(transcript).includes(e);
}

const DAY = 86_400_000;
/** A yyyy-mm-dd date on or after the call and within a year of it, or null. */
export function checkedDate(value: string | null, callDay: string): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  const call = new Date(`${callDay}T12:00:00Z`).getTime();
  if (d.getTime() < call || d.getTime() > call + 366 * DAY) return null;
  return value;
}

const tidy = (s: string) => removeDashPunctuation(s.trim().replace(/\s+/g, " "));

const hasNoInventedNumbers = (text: string, source: string) => {
  try {
    checkNoInventedNumbers(text, source);
    return true;
  } catch {
    return false;
  }
};

/**
 * Checks the AI's answer against the transcript. Serious problems cause a retry; smaller ones
 * (a quote that cannot be found, a figure not in the call, an impossible date) remove just that
 * item, and are listed so the person can see what was left out.
 */
export function makeTranscriptChecker(opts: { transcript: string; callDay: string; openStageNames: string[] }) {
  return (data: unknown): TranscriptReading => {
    const parsed = transcriptOutputSchema.safeParse(data);
    if (!parsed.success) throw new AiAnswerError("The AI answer was missing required parts.");
    const a = parsed.data;
    const dropped: string[] = [];

    const summary = tidy(a.summary);
    const sentences = countSentences(summary);
    if (sentences < 1 || sentences > 5 || summary.length > 1000) throw new AiAnswerError("The summary must be 2 to 4 sentences.");
    if (!hasNoInventedNumbers(summary, opts.transcript)) throw new AiAnswerError("The summary contained figures that were not in the call.");

    const qualification: TranscriptReading["qualification"] = [];
    for (const q of a.qualification) {
      const label = QUALIFICATION_FIELDS.find((f) => f.key === q.field)!.label;
      const value = tidy(q.value).slice(0, 500);
      if (!value) continue;
      if (qualification.some((x) => x.field === q.field)) continue;
      if (!evidenceFound(q.evidence, opts.transcript)) {
        dropped.push(`${label}: the supporting words could not be found in the transcript.`);
        continue;
      }
      if (!hasNoInventedNumbers(value, opts.transcript)) {
        dropped.push(`${label}: it contained figures that were not in the call.`);
        continue;
      }
      qualification.push({ field: q.field, value, evidence: q.evidence.trim().slice(0, 400) });
    }

    let suggestedStage: TranscriptReading["suggestedStage"] = null;
    if (a.suggestedStage) {
      const match = opts.openStageNames.find((n) => n.toLowerCase() === a.suggestedStage!.stageName.trim().toLowerCase());
      if (!match) dropped.push(`Stage change to "${a.suggestedStage.stageName}": not one of the open stages.`);
      else if (!evidenceFound(a.suggestedStage.evidence, opts.transcript)) dropped.push(`Stage change to ${match}: the supporting words could not be found in the transcript.`);
      else suggestedStage = { stageName: match, reason: tidy(a.suggestedStage.reason).slice(0, 300), evidence: a.suggestedStage.evidence.trim().slice(0, 400) };
    }

    const followUps = a.followUps.slice(0, 5).map((f) => {
      let draftMessage = f.draftMessage ? f.draftMessage.trim().replace(/[ \t]+/g, " ").slice(0, 2000) : null;
      if (draftMessage) draftMessage = removeDashPunctuation(draftMessage);
      if (draftMessage && !hasNoInventedNumbers(draftMessage, opts.transcript)) {
        dropped.push(`Draft message for "${tidy(f.title)}": it contained figures that were not in the call.`);
        draftMessage = null;
      }
      return { title: tidy(f.title).slice(0, 150), type: f.type as TaskType, dueDate: checkedDate(f.dueDate, opts.callDay), reason: tidy(f.reason).slice(0, 300), draftMessage };
    }).filter((f) => f.title);

    const recordingNotice =
      a.recordingNotice.mentioned && a.recordingNotice.evidence && evidenceFound(a.recordingNotice.evidence, opts.transcript)
        ? { mentioned: true, evidence: a.recordingNotice.evidence.trim().slice(0, 300) }
        : { mentioned: false, evidence: null };

    return {
      outcome: a.outcome,
      summary,
      promises: a.promises.slice(0, 10).map((p) => ({ text: tidy(p.text).slice(0, 300), dueDate: checkedDate(p.dueDate, opts.callDay), byWhom: p.byWhom })).filter((p) => p.text),
      objections: a.objections.slice(0, 10).map((o) => ({ objection: tidy(o.objection).slice(0, 300), howHandled: o.howHandled ? tidy(o.howHandled).slice(0, 300) : null })).filter((o) => o.objection),
      nextStep: a.nextStep ? tidy(a.nextStep).slice(0, 300) || null : null,
      qualification,
      suggestedStage,
      followUps,
      recordingNotice,
      dropped,
    };
  };
}
