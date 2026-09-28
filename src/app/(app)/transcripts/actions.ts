"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { actionUser } from "@/lib/session";
import { canView } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { enqueue } from "@/jobs/boss";
import { QUEUES } from "@/jobs/queues";
import { ExtractError, extractText, MAX_UPLOAD_BYTES, titleFromFileName } from "@/lib/knowledge/extract";
import { DealError } from "@/lib/deals/service";
import { startOfLondonDay } from "@/lib/calendar-view";
import {
  approveSuggestion, deleteTranscript, linkTranscript, manageableTranscript, rejectSuggestion, saveTranscript, TranscriptError,
} from "@/lib/transcripts/service";
import { createWebhookKey, removeWebhookKey } from "@/lib/transcripts/webhook";

/** Errors whose message is written for the person, so it can be shown as it is. */
function explain(error: unknown): ActionResult {
  if (error instanceof TranscriptError || error instanceof DealError || error instanceof ExtractError) return { ok: false, message: error.message };
  return failure(error);
}

async function queueReading(transcriptId: string) {
  try {
    await enqueue(QUEUES.transcriptProcess, { transcriptId }, { singletonKey: `transcript:${transcriptId}:${Date.now()}` });
  } catch (error) {
    // Saved; the hourly sweep reads anything still waiting.
    logger.warn("Could not queue transcript reading", { transcriptId, error: String(error) });
  }
}

async function queueAlerts(ids: string[]) {
  for (const notificationId of ids) {
    try {
      await enqueue(QUEUES.sendNotification, { notificationId });
    } catch (error) {
      logger.warn("Could not queue alert, the regular sweep will send it", { notificationId, error: String(error) });
    }
  }
}

const notice = z.enum(["yes", "no", "unknown"]).transform((v) => (v === "yes" ? true : v === "no" ? false : null));

export async function addTranscript(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const me = await actionUser();
    const input = z
      .object({
        title: optionalText(200),
        text: z.string().optional().default(""),
        contactId: optionalText(40),
        dealId: optionalText(40),
        callDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
        callTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
        recordingNotice: notice,
        recordingNoticeDetail: optionalText(500),
      })
      .parse({ ...Object.fromEntries([...formData].filter(([, v]) => typeof v === "string")), recordingNotice: formData.get("recordingNotice") ?? "unknown" });

    let text = input.text.trim();
    let title = input.title;
    let source: "PASTE" | "UPLOAD" = "PASTE";
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "The file is larger than 10 MB." };
      text = await extractText(file.name, new Uint8Array(await file.arrayBuffer()));
      title = title ?? titleFromFileName(file.name);
      source = "UPLOAD";
    }
    if (!text) return { ok: false, message: "Paste the transcript or choose a file." };

    // Only link records the person may see.
    const [contact, deal] = await Promise.all([
      input.contactId ? prisma.contact.findFirst({ where: { id: input.contactId, organisationId: me.organisationId } }) : null,
      input.dealId ? prisma.deal.findFirst({ where: { id: input.dealId, organisationId: me.organisationId } }) : null,
    ]);
    if (input.contactId && (!contact || !canView(me, contact))) return { ok: false, message: "That contact could not be found." };
    if (input.dealId && (!deal || !canView(me, deal))) return { ok: false, message: "That deal could not be found." };

    let callAt: Date | null = null;
    if (input.callDate) {
      const [h, m] = (input.callTime || "12:00").split(":").map(Number);
      callAt = new Date(startOfLondonDay(input.callDate).getTime() + (h * 60 + m) * 60_000);
    }
    const saved = await saveTranscript({
      organisationId: me.organisationId, source, text, title, callAt, uploadedById: me.id,
      contactId: contact?.id ?? null, dealId: deal?.id ?? null,
      recordingNoticeGiven: input.recordingNotice, recordingNoticeDetail: input.recordingNoticeDetail,
    });
    id = saved.id;
    await queueReading(id);
  } catch (error) {
    return explain(error);
  }
  revalidatePath("/transcripts");
  redirect(`/transcripts/${id}`);
}

export async function linkTranscriptAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string().min(1), contactId: optionalText(40), dealId: optionalText(40) }).parse(Object.fromEntries(formData));
    const r = await linkTranscript(me, input.id, { contactId: input.contactId, dealId: input.dealId });
    // A new deal means the suggestions need working out again for that deal.
    if (r.dealChanged && input.dealId) await queueReading(input.id);
    revalidatePath(`/transcripts/${input.id}`);
    revalidatePath("/transcripts");
    return { ok: true, message: r.dealChanged && input.dealId ? "Linked. The call is being read again for the new deal." : "Saved." };
  } catch (error) {
    return explain(error);
  }
}

export async function setRecordingNotice(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string().min(1), recordingNotice: notice, recordingNoticeDetail: optionalText(500) }).parse(Object.fromEntries(formData));
    const t = await manageableTranscript(me, input.id);
    await prisma.callTranscript.update({ where: { id: t.id }, data: { recordingNoticeGiven: input.recordingNotice, recordingNoticeDetail: input.recordingNoticeDetail } });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "transcript.recording_notice_updated", entityType: "CallTranscript", entityId: t.id, details: { given: input.recordingNotice } });
    revalidatePath(`/transcripts/${t.id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return explain(error);
  }
}

export async function readAgain(formData: FormData) {
  const me = await actionUser();
  const t = await manageableTranscript(me, z.string().min(1).parse(formData.get("id")));
  await prisma.callTranscript.update({ where: { id: t.id }, data: { processingStatus: "PENDING", processingError: null } });
  await queueReading(t.id);
  revalidatePath(`/transcripts/${t.id}`);
}

export async function deleteTranscriptAction(formData: FormData) {
  const me = await actionUser();
  const id = z.string().min(1).parse(formData.get("id"));
  if (formData.get("confirm") !== "yes") throw new TranscriptError("Tick the box to confirm.");
  await deleteTranscript(me, id);
  revalidatePath("/transcripts");
  redirect("/transcripts?deleted=1");
}

export async function approveSuggestionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const input = z.object({ id: z.string().min(1), value: z.string().max(2000).optional() }).parse(Object.fromEntries(formData));
    const r = await approveSuggestion(me, input.id, input.value);
    await queueAlerts(r.alertIds);
    revalidatePath(`/transcripts/${r.transcriptId}`);
    revalidatePath(`/deals/${r.dealId}`);
    revalidatePath("/deals");
    return { ok: true, message: "Approved and applied to the deal." };
  } catch (error) {
    return explain(error);
  }
}

export async function rejectSuggestionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser();
    const r = await rejectSuggestion(me, z.string().min(1).parse(formData.get("id")));
    revalidatePath(`/transcripts/${r.transcriptId}`);
    revalidatePath(`/deals/${r.dealId}`);
    return { ok: true, message: "Rejected. The deal was not changed." };
  } catch (error) {
    return explain(error);
  }
}

export async function createKeyAction(_prev: { ok: boolean; message: string; key?: string } | null, _formData: FormData) {
  try {
    const me = await actionUser("settings.manage");
    const key = await createWebhookKey(me.organisationId);
    await audit({ organisationId: me.organisationId, userId: me.id, action: "transcript.webhook_key_created", entityType: "Organisation", entityId: me.organisationId });
    revalidatePath("/settings/transcripts");
    return { ok: true, message: "New key created. Copy it now: it will not be shown again. Any older key has stopped working.", key };
  } catch (error) {
    return failure(error);
  }
}

export async function removeKeyAction(formData: FormData) {
  const me = await actionUser("settings.manage");
  if (formData.get("confirm") !== "yes") return;
  await removeWebhookKey(me.organisationId);
  await audit({ organisationId: me.organisationId, userId: me.id, action: "transcript.webhook_key_removed", entityType: "Organisation", entityId: me.organisationId });
  revalidatePath("/settings/transcripts");
}
