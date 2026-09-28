"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { ExtractError, extractText, MAX_TEXT_CHARS, MAX_UPLOAD_BYTES, tidyText, titleFromFileName } from "@/lib/knowledge/extract";

const kindSchema = z.enum(["COMPANY_CONTEXT", "PRODUCT", "CASE_STUDY", "TRANSCRIPT", "OTHER"]);
const onOff = z.string().optional().transform((v) => v === "on");

export async function uploadDocuments(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("knowledge.manage");
    const kind = kindSchema.parse(formData.get("kind"));
    const containsPersonalData = onOff.parse(formData.get("containsPersonalData") ?? undefined);
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { ok: false, message: "Choose or drop at least one file." };
    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_UPLOAD_BYTES) return { ok: false, message: "Please upload at most 10 MB at a time." };

    const saved: string[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        const text = await extractText(file.name, new Uint8Array(await file.arrayBuffer()));
        const doc = await prisma.knowledgeDocument.create({
          data: {
            organisationId: me.organisationId,
            title: titleFromFileName(file.name),
            kind,
            fileName: file.name.slice(0, 200),
            mimeType: file.type || null,
            sizeBytes: file.size,
            text,
            charCount: text.length,
            containsPersonalData,
            // Documents holding personal details are never sent to the AI.
            useForAi: !containsPersonalData,
            uploadedById: me.id,
          },
        });
        await audit({ organisationId: me.organisationId, userId: me.id, action: "knowledge.uploaded", entityType: "KnowledgeDocument", entityId: doc.id, details: { fileName: file.name, kind } });
        saved.push(file.name);
      } catch (error) {
        problems.push(error instanceof ExtractError ? error.message : `${file.name}: could not be saved.`);
      }
    }
    revalidatePath("/knowledge");
    if (saved.length === 0) return { ok: false, message: problems.join(" ") };
    return {
      ok: problems.length === 0,
      message: `Added ${saved.length} ${saved.length === 1 ? "document" : "documents"}.${problems.length ? ` Not added: ${problems.join(" ")}` : ""}`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function addPastedText(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("knowledge.manage");
    const input = z
      .object({
        title: z.string().trim().min(2, "Give the document a title.").max(200),
        kind: kindSchema,
        text: z.string().max(MAX_TEXT_CHARS, "The text is too long. Please split it into smaller documents."),
        containsPersonalData: onOff,
      })
      .parse(Object.fromEntries(formData));
    const text = tidyText(input.text);
    if (text.length < 20) return { ok: false, message: "Please paste at least a sentence or two." };
    const doc = await prisma.knowledgeDocument.create({
      data: {
        organisationId: me.organisationId,
        title: input.title,
        kind: input.kind,
        text,
        charCount: text.length,
        containsPersonalData: input.containsPersonalData,
        useForAi: !input.containsPersonalData,
        uploadedById: me.id,
      },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "knowledge.added", entityType: "KnowledgeDocument", entityId: doc.id, details: { kind: input.kind } });
    revalidatePath("/knowledge");
    return { ok: true, message: `Added "${input.title}".` };
  } catch (error) {
    return failure(error);
  }
}

export async function updateDocument(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("knowledge.manage");
    const input = z
      .object({
        id: z.string(),
        title: z.string().trim().min(2, "Give the document a title.").max(200),
        kind: kindSchema,
        description: optionalText(500),
        useForAi: onOff,
        containsPersonalData: onOff,
      })
      .parse(Object.fromEntries(formData));
    const doc = await prisma.knowledgeDocument.findFirst({ where: { id: input.id, organisationId: me.organisationId } });
    if (!doc) return { ok: false, message: "That document could not be found." };
    if (input.useForAi && input.containsPersonalData) {
      return { ok: false, message: "Documents holding personal details cannot be used by the AI. Remove the personal details first, then untick that box." };
    }
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { title: input.title, kind: input.kind, description: input.description, useForAi: input.useForAi, containsPersonalData: input.containsPersonalData },
    });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "knowledge.updated", entityType: "KnowledgeDocument", entityId: doc.id, details: { useForAi: input.useForAi } });
    revalidatePath("/knowledge");
    revalidatePath(`/knowledge/${doc.id}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const me = await actionUser("knowledge.manage");
  const id = z.string().parse(formData.get("id"));
  const result = await prisma.knowledgeDocument.deleteMany({ where: { id, organisationId: me.organisationId } });
  if (result.count > 0) {
    await audit({ organisationId: me.organisationId, userId: me.id, action: "knowledge.deleted", entityType: "KnowledgeDocument", entityId: id });
  }
  revalidatePath("/knowledge");
  redirect("/knowledge");
}
