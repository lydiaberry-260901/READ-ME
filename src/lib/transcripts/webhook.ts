// The secure web address call recording tools send transcripts to. Each organisation has one secret
// key; only a hash of it is stored, so it cannot be read back, only replaced.
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import type { Participant } from "./service";

export const WEBHOOK_PATH = "/api/transcripts/webhook";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Creates a new key, replacing any old one. The key is returned once and never stored. */
export async function createWebhookKey(organisationId: string, now = new Date()) {
  const key = `mct_${randomToken(32)}`;
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { transcriptWebhookKeyHash: hashKey(key), transcriptWebhookKeyHint: key.slice(-4), transcriptWebhookCreatedAt: now },
  });
  return key;
}

export async function removeWebhookKey(organisationId: string) {
  await prisma.organisation.update({ where: { id: organisationId }, data: { transcriptWebhookKeyHash: null, transcriptWebhookKeyHint: null, transcriptWebhookCreatedAt: null } });
}

/** Reads the key from "Authorization: Bearer ..." or "X-Moca-Key", and finds its organisation. */
export async function organisationForKey(headers: Headers) {
  const auth = headers.get("authorization") ?? "";
  const key = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : headers.get("x-moca-key") ?? "").trim();
  if (!/^mct_[A-Za-z0-9_-]{20,}$/.test(key)) return null;
  const hash = hashKey(key);
  const org = await prisma.organisation.findFirst({ where: { transcriptWebhookKeyHash: hash }, select: { id: true, transcriptWebhookKeyHash: true } });
  if (!org?.transcriptWebhookKeyHash) return null;
  const a = Buffer.from(org.transcriptWebhookKeyHash);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b) ? org.id : null;
}

// Recording tools name things differently, so the common names are all accepted.
const participantSchema = z.object({ name: z.string().max(200).nullish(), email: z.string().max(320).nullish() }).passthrough();
const segmentSchema = z.object({ speaker: z.string().max(200).nullish(), text: z.string() }).passthrough();

export const webhookPayloadSchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullish(),
    externalId: z.union([z.string(), z.number()]).nullish(),
    callId: z.union([z.string(), z.number()]).nullish(),
    title: z.string().max(500).nullish(),
    text: z.string().nullish(),
    transcript: z.string().nullish(),
    segments: z.array(segmentSchema).max(20_000).nullish(),
    callAt: z.string().nullish(),
    startedAt: z.string().nullish(),
    durationSeconds: z.number().nonnegative().nullish(),
    duration: z.number().nonnegative().nullish(),
    participants: z.array(participantSchema).max(50).nullish(),
    attendees: z.array(participantSchema).max(50).nullish(),
    recordingNoticeGiven: z.boolean().nullish(),
  })
  .passthrough();

export type ParsedWebhook = {
  externalId: string | null;
  title: string | null;
  text: string;
  callAt: Date | null;
  durationSeconds: number | null;
  participants: Participant[];
  recordingNoticeGiven: boolean | null;
};

export function parseWebhookPayload(body: unknown): { ok: true; value: ParsedWebhook } | { ok: false; message: string } {
  const parsed = webhookPayloadSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: "The data was not in a form we could read." };
  const p = parsed.data;
  const text = p.text ?? p.transcript ?? (p.segments ? p.segments.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join("\n") : "");
  if (!text.trim()) return { ok: false, message: "No transcript text was sent. Use text, transcript or segments." };
  const rawDate = p.callAt ?? p.startedAt;
  const callAt = rawDate ? new Date(rawDate) : null;
  const id = p.externalId ?? p.callId ?? p.id;
  return {
    ok: true,
    value: {
      externalId: id === null || id === undefined ? null : String(id).slice(0, 200),
      title: p.title ?? null,
      text,
      callAt: callAt && !Number.isNaN(callAt.getTime()) ? callAt : null,
      durationSeconds: Math.round(p.durationSeconds ?? p.duration ?? 0) || null,
      participants: (p.participants ?? p.attendees ?? []).map((x) => ({ name: x.name ?? null, email: x.email ?? null })),
      recordingNoticeGiven: p.recordingNoticeGiven ?? null,
    },
  };
}
