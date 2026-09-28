// Deal qualification fields, known together in sales as MEDDPICC.
// Completeness is the share of the eight fields that have been filled in.

export const QUALIFICATION_FIELDS = [
  { key: "metric", label: "Metric", help: "The measurable outcome the buyer wants." },
  { key: "economicBuyer", label: "Economic buyer", help: "Who signs off the spend." },
  { key: "decisionCriteria", label: "Decision criteria", help: "How they will judge the options." },
  { key: "decisionProcess", label: "Decision process", help: "The steps and people involved in deciding." },
  { key: "paperProcess", label: "Paper process", help: "Procurement, legal or security steps." },
  { key: "identifiedPain", label: "Identified pain", help: "The problem they need solved." },
  { key: "champion", label: "Champion", help: "Who inside the company is pushing for us." },
  { key: "competition", label: "Competition", help: "Who or what else they are considering." },
] as const;

export type QualificationKey = (typeof QUALIFICATION_FIELDS)[number]["key"];
export type QualificationValues = Partial<Record<QualificationKey, string | null | undefined>>;

export function qualificationCompleteness(values: QualificationValues): number {
  const filled = QUALIFICATION_FIELDS.filter((f) => (values[f.key] ?? "").trim().length > 0).length;
  return Math.round((filled / QUALIFICATION_FIELDS.length) * 100);
}
