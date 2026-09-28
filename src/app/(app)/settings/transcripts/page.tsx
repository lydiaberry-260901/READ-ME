import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { WEBHOOK_PATH } from "@/lib/transcripts/webhook";
import { PageHeader } from "@/components/ui";
import { CreateKeyForm, RemoveKeyForm } from "./KeyForms";

export const metadata = { title: "Call recording tools" };

const example = `{
  "externalId": "call-12345",
  "title": "Discovery call with Harbourline",
  "callAt": "2026-09-28T10:30:00Z",
  "durationSeconds": 1260,
  "participants": [
    { "name": "Aisha Rahman", "email": "aisha@your-company.example" },
    { "name": "Grace Okafor", "email": "grace@harbourline.example" }
  ],
  "recordingNoticeGiven": true,
  "text": "Aisha: Thanks for joining. This call is recorded for training and notes..."
}`;

export default async function TranscriptSettingsPage() {
  const user = await requireCapability("settings.manage");
  const [org, received] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId }, select: { transcriptWebhookKeyHash: true, transcriptWebhookKeyHint: true, transcriptWebhookCreatedAt: true } }),
    prisma.callTranscript.count({ where: { organisationId: user.organisationId, source: "WEBHOOK" } }),
  ]);
  const url = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${WEBHOOK_PATH}`;
  const hasKey = Boolean(org.transcriptWebhookKeyHash);

  return (
    <>
      <PageHeader
        title="Call recording tools"
        description="A secure web address a call recording tool can send transcripts to. Calls arrive on the Calls page and are read by the AI like any other."
      />
      <div className="grid gap-12 xl:grid-cols-2">
        <section className="grid content-start gap-6">
          <div>
            <h2 className="text-sm font-semibold">Web address</h2>
            <code className="mt-2 block break-all rounded border border-line bg-canvas-deep px-3 py-2 font-mono text-sm">{url}</code>
            <p className="mt-1 text-xs text-fg-muted">The tool sends a POST request with JSON data, and the key in the header <code className="font-mono">Authorization: Bearer your_key</code>.</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Secret key</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {hasKey
                ? `A key ending in ${org.transcriptWebhookKeyHint} was created on ${formatDateTime(org.transcriptWebhookCreatedAt!)}. Only a scrambled copy is kept, so it cannot be shown again.`
                : "No key yet, so nothing can be sent in."}
            </p>
            <p className="mt-1 text-sm text-fg-muted">{received === 1 ? "1 call" : `${received} calls`} received from recording tools so far.</p>
            <div className="mt-3"><CreateKeyForm hasKey={hasKey} /></div>
            {hasKey ? <div className="mt-5"><RemoveKeyForm /></div> : null}
          </div>
        </section>
        <section className="grid content-start gap-4 text-sm">
          <h2 className="font-semibold">What to send</h2>
          <pre className="overflow-x-auto rounded border border-line bg-canvas-deep px-4 py-3 font-mono text-xs leading-relaxed">{example}</pre>
          <ul className="list-disc space-y-1.5 pl-5 text-fg-muted">
            <li>Only the text is required. <code className="font-mono">transcript</code>, or <code className="font-mono">segments</code> with a speaker and text each, are accepted instead of <code className="font-mono">text</code>.</li>
            <li>The same <code className="font-mono">externalId</code> is never saved twice, so the tool can safely send a call again.</li>
            <li>Participants are matched by work email: a contact links the call to them and their open deal, and a team member becomes the person who made the call. Anything not matched waits on the Calls page for someone to link.</li>
            <li>Say whether the person was told the call was recorded with <code className="font-mono">recordingNoticeGiven</code>. If it is missing, the call is flagged until someone records it.</li>
            <li>Replies: 201 when saved, 200 if it was already saved, 400 if the data cannot be read, 401 if the key is wrong.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
