"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, type ActionResult } from "@/lib/action-result";
import { unknownPlaceholders } from "@/lib/outreach/merge";
import { installStarterLibrary } from "@/lib/outreach/starter-library";
import { OutreachBlockedError } from "@/lib/outreach/context";
import { createEmailDraft, createScriptDraft, markScriptReady, ownDraft } from "@/lib/outreach/drafts";
import { removeDashPunctuation } from "@/lib/text";
import { sendDraft } from "@/lib/integrations/send";

const groupSchema = z.enum(["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", ""]).transform((v) => (v ? v : null));
const reasonSchema = z.enum(["EPC_RISK", "NET_ZERO", "NEW_ESG_HIRE", "TENDER", "ACQUISITION", "GENERAL_INTRO"]);

function checkPlaceholders(...texts: string[]) {
  const unknown = texts.flatMap(unknownPlaceholders);
  if (unknown.length) {
    throw new z.ZodError([{ code: "custom", path: ["body"], message: `These merge fields do not exist: ${[...new Set(unknown)].map((u) => `{{${u}}}`).join(", ")}. Use the list beside the editor.`, input: "" }]);
  }
}

function blocked(error: unknown): ActionResult {
  if (error instanceof OutreachBlockedError) return { ok: false, message: error.message };
  return failure(error);
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  name: z.string().trim().min(2, "Give the template a name.").max(120),
  customerGroup: groupSchema,
  reason: reasonSchema,
  subject: z.string().trim().min(2, "Write a subject line.").max(200),
  body: z.string().trim().min(20, "Write the email.").max(5000),
  isMarketing: z.string().optional().transform((v) => v === "on"),
  active: z.string().optional().transform((v) => v === "on"),
});

export async function saveTemplate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string | null = null;
  try {
    const me = await actionUser("templates.manage");
    const existingId = formData.get("id") ? z.string().parse(formData.get("id")) : null;
    const input = templateSchema.parse(Object.fromEntries(formData));
    checkPlaceholders(input.subject, input.body);
    const data = { ...input, subject: removeDashPunctuation(input.subject) };
    if (existingId) {
      const existing = await prisma.emailTemplate.findFirst({ where: { id: existingId, organisationId: me.organisationId } });
      if (!existing) return { ok: false, message: "That template could not be found." };
      await prisma.emailTemplate.update({ where: { id: existingId }, data: { ...data, version: { increment: 1 } } });
      await audit({ organisationId: me.organisationId, userId: me.id, action: "template.updated", entityType: "EmailTemplate", entityId: existingId });
      revalidatePath("/outreach");
      return { ok: true, message: "Saved." };
    }
    const created = await prisma.emailTemplate.create({ data: { ...data, organisationId: me.organisationId, createdById: me.id } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "template.created", entityType: "EmailTemplate", entityId: created.id });
    id = created.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/outreach/emails/${id}`);
}

// ---------------------------------------------------------------------------
// Call scripts
// ---------------------------------------------------------------------------

export async function saveScript(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string | null = null;
  try {
    const me = await actionUser("templates.manage");
    const existingId = formData.get("id") ? z.string().parse(formData.get("id")) : null;
    const input = z
      .object({
        name: z.string().trim().min(2, "Give the script a name.").max(120),
        customerGroup: groupSchema,
        reason: reasonSchema,
        opening: z.string().trim().min(10, "Write an opening line.").max(1000),
        ask: z.string().trim().min(5, "Write the request at the end of the call.").max(500),
        active: z.string().optional().transform((v) => v === "on"),
      })
      .parse(Object.fromEntries(formData));
    const questions = formData.getAll("question").map(String).map((q) => q.trim()).filter(Boolean).slice(0, 6);
    const objectionTexts = formData.getAll("objection").map(String);
    const responseTexts = formData.getAll("response").map(String);
    const objections = objectionTexts
      .map((o, i) => ({ objection: o.trim(), response: (responseTexts[i] ?? "").trim() }))
      .filter((o) => o.objection || o.response);
    if (questions.length < 1) return { ok: false, message: "Add at least one question." };
    if (objections.some((o) => !o.objection || !o.response)) return { ok: false, message: "Each objection needs a suggested reply." };
    checkPlaceholders(input.opening, input.ask, ...questions, ...objections.flatMap((o) => [o.objection, o.response]));

    const data = { ...input, questions, objections };
    if (existingId) {
      const existing = await prisma.callScript.findFirst({ where: { id: existingId, organisationId: me.organisationId } });
      if (!existing) return { ok: false, message: "That script could not be found." };
      await prisma.callScript.update({ where: { id: existingId }, data });
      await audit({ organisationId: me.organisationId, userId: me.id, action: "call_script.updated", entityType: "CallScript", entityId: existingId });
      revalidatePath("/outreach");
      return { ok: true, message: "Saved." };
    }
    const created = await prisma.callScript.create({ data: { ...data, organisationId: me.organisationId, createdById: me.id } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "call_script.created", entityType: "CallScript", entityId: created.id });
    id = created.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/outreach/scripts/${id}`);
}

export async function addStarterLibrary(): Promise<void> {
  const me = await actionUser("templates.manage");
  const added = await installStarterLibrary(prisma, me.organisationId);
  await audit({ organisationId: me.organisationId, userId: me.id, action: "outreach.starter_library_added", details: added });
  revalidatePath("/outreach");
}

// ---------------------------------------------------------------------------
// Drafts for a contact
// ---------------------------------------------------------------------------

export async function startDraft(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let draftId: string;
  try {
    const me = await actionUser();
    const input = z
      .object({
        contactId: z.string(),
        kind: z.enum(["email", "script"]),
        itemId: z.string().min(1, "Choose a template or script first."),
        mode: z.enum(["plain", "ai"]),
      })
      .parse(Object.fromEntries(formData));
    const useAi = input.mode === "ai";
    const draft =
      input.kind === "email"
        ? await createEmailDraft(me, { contactId: input.contactId, templateId: input.itemId, useAi })
        : await createScriptDraft(me, { contactId: input.contactId, scriptId: input.itemId, useAi });
    draftId = draft.id;
  } catch (error) {
    return blocked(error);
  }
  redirect(`/outreach/drafts/${draftId}`);
}

export async function saveEmailDraft(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z
      .object({ id: z.string(), subject: z.string().trim().min(1, "Write a subject line.").max(200), body: z.string().trim().min(1, "Write the email.").max(8000) })
      .parse(Object.fromEntries(formData));
    const draft = await ownDraft(me, input.id);
    if (draft.kind !== "EMAIL" || draft.status !== "DRAFT") return { ok: false, message: "This draft can no longer be changed." };
    await prisma.outreachDraft.update({ where: { id: draft.id }, data: { subject: input.subject, body: input.body } });
    revalidatePath(`/outreach/drafts/${draft.id}`);
    return { ok: true, message: "Draft saved. It has not been sent." };
  } catch (error) {
    return blocked(error);
  }
}

export async function saveScriptDraft(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    const draft = await ownDraft(me, id);
    if (draft.kind !== "CALL_SCRIPT" || draft.status === "DISCARDED") return { ok: false, message: "This draft can no longer be changed." };
    const opening = String(formData.get("opening") ?? "").trim();
    const ask = String(formData.get("ask") ?? "").trim();
    const questions = formData.getAll("question").map(String).map((q) => q.trim()).filter(Boolean);
    const responses = formData.getAll("response").map(String);
    const objections = formData.getAll("objection").map(String).map((o, i) => ({ objection: o.trim(), response: (responses[i] ?? "").trim() })).filter((o) => o.objection);
    if (!opening || !ask) return { ok: false, message: "The opening and the ask cannot be empty." };
    await prisma.outreachDraft.update({ where: { id: draft.id }, data: { opening, ask, questions, objections } });
    revalidatePath(`/outreach/drafts/${draft.id}`);
    return { ok: true, message: "Script saved." };
  } catch (error) {
    return blocked(error);
  }
}

export async function markReady(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    await markScriptReady(me, id);
    await audit({ organisationId: me.organisationId, userId: me.id, action: "outreach.call_ready", entityType: "OutreachDraft", entityId: id });
    revalidatePath(`/outreach/drafts/${id}`);
    return { ok: true, message: "Marked ready to call." };
  } catch (error) {
    return blocked(error);
  }
}

export async function sendDraftAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const id = z.string().parse(formData.get("id"));
    // Save any last edits first, so exactly what the person sees is what is sent.
    const subject = formData.get("subject");
    const body = formData.get("body");
    if (typeof subject === "string" && typeof body === "string") {
      const draft = await ownDraft(me, id);
      if (draft.status === "DRAFT") await prisma.outreachDraft.update({ where: { id }, data: { subject: subject.trim(), body: body.trim() } });
    }
    await sendDraft(me, id);
    revalidatePath(`/outreach/drafts/${id}`);
    revalidatePath("/outreach/drafts");
    return { ok: true, message: "Sent from your email account." };
  } catch (error) {
    return blocked(error);
  }
}

export async function discardDraft(formData: FormData): Promise<void> {
  const me = await actionUser();
  const id = z.string().parse(formData.get("id"));
  const draft = await ownDraft(me, id);
  await prisma.outreachDraft.update({ where: { id: draft.id }, data: { status: "DISCARDED" } });
  revalidatePath("/outreach/drafts");
  redirect(draft.contactId ? `/contacts/${draft.contactId}` : "/outreach/drafts");
}
