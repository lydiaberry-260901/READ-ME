"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser, AccessDeniedError } from "@/lib/session";
import { failure } from "@/lib/action-result";
import { IMPORT_FIELDS } from "@/lib/import/fields";
import { MAX_IMPORT_ROWS, previewImport, runImport, type ImportReportLine } from "@/lib/import/run";
import type { RowPlan } from "@/lib/import/plan";

const fieldKeys = IMPORT_FIELDS.map((f) => f.key) as [string, ...string[]];

const payloadSchema = z.object({
  fileName: z.string().max(200),
  rows: z.array(z.record(z.string(), z.string().max(5000))).min(1, "The file has no rows.").max(MAX_IMPORT_ROWS, `Please import at most ${MAX_IMPORT_ROWS} rows at a time.`),
  mapping: z.partialRecord(z.enum(fieldKeys), z.string()),
  settings: z.object({
    source: z.string().trim().min(2, "Say where this data came from.").max(200),
    collectedAt: z.coerce.date(),
    lawfulBasis: z.enum(["LEGITIMATE_INTERESTS", "CONSENT", "CONTRACT"]),
    defaultEntityType: z.enum(["LIMITED_COMPANY", "PUBLIC_BODY", "LLP", "SOLE_TRADER", "PARTNERSHIP", "UNKNOWN"]),
    defaultCustomerGroup: z.enum(["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", ""]).transform((v) => (v ? v : null)),
    ownerId: z.string(),
    isShared: z.boolean(),
    duplicateContacts: z.enum(["skip", "update"]),
  }),
});

export type ImportPayload = z.input<typeof payloadSchema>;

type PreviewResult =
  | { ok: false; message: string }
  | { ok: true; summary: Awaited<ReturnType<typeof previewImport>>["summary"]; lines: ImportReportLine[] };

function describe(plan: RowPlan): ImportReportLine {
  const company =
    plan.company.kind === "create" ? "Will be created"
      : plan.company.kind === "existing" ? "Already in the CRM, will be linked"
        : plan.company.kind === "same_as_row" ? `Same company as row ${plan.company.row}`
          : "";
  const contact =
    plan.contact.kind === "create" ? "Will be created"
      : plan.contact.kind === "update" ? "Already exists, empty fields will be filled in"
        : plan.contact.kind === "skip" ? "Will be skipped"
          : "";
  const notes = [...plan.warnings];
  if (plan.contact.kind === "skip") notes.push(plan.contact.reason);
  if (plan.company.kind === "none" && plan.contact.kind === "none") notes.push(...plan.errors);
  return { row: plan.row, company, contact, notes };
}

export async function checkImport(payload: ImportPayload): Promise<PreviewResult> {
  try {
    const me = await actionUser();
    const input = payloadSchema.parse(payload);
    if (input.settings.collectedAt > new Date()) return { ok: false, message: "The collection date cannot be in the future." };
    const { plans, summary } = await previewImport(me.organisationId, input.rows, input.mapping, input.settings.duplicateContacts);
    return { ok: true, summary, lines: plans.map(describe) };
  } catch (error) {
    return { ok: false, message: failure(error).message };
  }
}

type RunResult =
  | { ok: false; message: string }
  | { ok: true; counts: Awaited<ReturnType<typeof runImport>>["counts"]; report: ImportReportLine[] };

export async function startImport(payload: ImportPayload): Promise<RunResult> {
  try {
    const me = await actionUser();
    const input = payloadSchema.parse(payload);
    if (input.settings.collectedAt > new Date()) return { ok: false, message: "The collection date cannot be in the future." };
    if (me.role === "REP" && input.settings.ownerId !== me.id) throw new AccessDeniedError("Reps can only import records they own.");
    const owner = await prisma.user.findFirst({ where: { id: input.settings.ownerId, organisationId: me.organisationId, active: true } });
    if (!owner) throw new AccessDeniedError("That owner could not be found.");

    const { counts, report } = await runImport(me, input.rows, input.mapping, { ...input.settings, fileName: input.fileName });
    revalidatePath("/companies");
    revalidatePath("/contacts");
    return { ok: true, counts, report };
  } catch (error) {
    return { ok: false, message: failure(error).message };
  }
}
