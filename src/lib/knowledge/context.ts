// Builds the "about our business" context the AI receives, from the knowledge library.
// Only documents switched on for AI, and not marked as holding personal details, are used.
// Email addresses and phone numbers are removed before anything is sent.
import { prisma } from "@/lib/db";
import type { KnowledgeKind } from "@/generated/prisma/enums";
import { redactPersonalDetails, truncate } from "@/lib/text";

export const knowledgeKindLabels: Record<KnowledgeKind, string> = {
  COMPANY_CONTEXT: "Company context",
  PRODUCT: "Product and services",
  CASE_STUDY: "Case study",
  TRANSCRIPT: "Transcript",
  OTHER: "Other",
};

// Most useful first, so the most important material survives if the total must be cut.
const KIND_ORDER: KnowledgeKind[] = ["COMPANY_CONTEXT", "PRODUCT", "CASE_STUDY", "TRANSCRIPT", "OTHER"];

export const DEFAULT_CONTEXT_CHARS = 40_000;

type Doc = { id: string; title: string; kind: KnowledgeKind; text: string; createdAt: Date };

/** Pure function, so it can be tested: orders documents and fits them into the character budget. */
export function assembleBusinessContext(docs: Doc[], maxChars = DEFAULT_CONTEXT_CHARS): { text: string; usedIds: string[] } {
  const sorted = [...docs].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const parts: string[] = [];
  const usedIds: string[] = [];
  let remaining = maxChars;
  for (const doc of sorted) {
    const header = `<document title="${doc.title.replace(/"/g, "'")}" type="${knowledgeKindLabels[doc.kind]}">\n`;
    const footer = "\n</document>";
    const room = remaining - header.length - footer.length;
    if (room < 500) break;
    const body = truncate(redactPersonalDetails(doc.text), room);
    parts.push(header + body + footer);
    usedIds.push(doc.id);
    remaining -= header.length + body.length + footer.length;
  }
  return { text: parts.join("\n\n"), usedIds };
}

export async function getBusinessContext(organisationId: string, maxChars = DEFAULT_CONTEXT_CHARS) {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { organisationId, useForAi: true, containsPersonalData: false },
    select: { id: true, title: true, kind: true, text: true, createdAt: true },
  });
  return assembleBusinessContext(docs, maxChars);
}
