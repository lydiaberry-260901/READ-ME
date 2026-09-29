// Secure web address that call recording tools send transcripts to.
// The tool must send the organisation's secret key in the "Authorization: Bearer" header.
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { clientAddress, rateLimit, tooMany } from "@/lib/rate-limit";
import { enqueue } from "@/jobs/boss";
import { QUEUES } from "@/jobs/queues";
import { organisationForKey, parseWebhookPayload } from "@/lib/transcripts/webhook";
import { matchParticipants, saveTranscript, TranscriptError } from "@/lib/transcripts/service";

const MAX_BODY_BYTES = 2_500_000;

export async function POST(request: Request) {
  const limit = rateLimit(`webhook:${clientAddress(request.headers)}`, 60, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const organisationId = await organisationForKey(request.headers);
  if (!organisationId) return NextResponse.json({ error: "The key is missing or not recognised." }, { status: 401 });

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return NextResponse.json({ error: "The data is too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "The data must be JSON." }, { status: 400 });
  }
  const parsed = parseWebhookPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  const p = parsed.value;
  try {
    const match = await matchParticipants(organisationId, p.participants);
    const saved = await saveTranscript({
      organisationId,
      source: "WEBHOOK",
      text: p.text,
      title: p.title,
      externalId: p.externalId,
      callAt: p.callAt,
      durationSeconds: p.durationSeconds,
      participants: p.participants,
      uploadedById: match.userId,
      contactId: match.contactId,
      recordingNoticeGiven: p.recordingNoticeGiven,
    });
    if (saved.duplicate) return NextResponse.json({ id: saved.id, duplicate: true }, { status: 200 });
    try {
      await enqueue(QUEUES.transcriptProcess, { transcriptId: saved.id }, { singletonKey: `transcript:${saved.id}` });
    } catch (error) {
      // Saved; the regular sweep picks up transcripts waiting to be read.
      logger.warn("Could not queue transcript reading", { transcriptId: saved.id, error: String(error) });
    }
    return NextResponse.json({ id: saved.id, matched: Boolean(match.contactId) }, { status: 201 });
  } catch (error) {
    if (error instanceof TranscriptError) return NextResponse.json({ error: error.message }, { status: 400 });
    logger.error("Transcript web address failed", { error: String(error) });
    return NextResponse.json({ error: "Something went wrong. Please try again later." }, { status: 500 });
  }
}
