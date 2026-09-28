import Link from "next/link";
import { requireUser } from "@/lib/session";
import { aiIsConfigured } from "@/lib/ai";
import { linkOptions } from "@/lib/transcripts/pickers";
import { Notice } from "@/components/ui";
import { AddTranscriptForm } from "../forms";

export const metadata = { title: "Add a call" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function NewTranscriptPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const p = await searchParams;
  const options = await linkOptions(user, { contactId: one(p.contactId) || null, dealId: one(p.dealId) || null });
  return (
    <div className="grid max-w-3xl gap-6">
      <p className="text-sm"><Link href="/transcripts">Calls</Link> <span className="text-fg-muted">/ Add a call</span></p>
      <header>
        <h1 className="text-2xl font-semibold">Add a call transcript</h1>
        <p className="mt-1 text-sm text-fg-muted">
          The AI reads the call and suggests an outcome, a summary, follow up tasks, and changes to the deal. Nothing on the deal changes until you approve each suggestion.
        </p>
      </header>
      {!aiIsConfigured() ? <Notice tone="amber" title="The AI is not set up">The transcript is saved now and read as soon as an admin adds the AI key.</Notice> : null}
      <section className="card p-6">
        <AddTranscriptForm contacts={options.contacts} deals={options.deals} contactId={one(p.contactId) || null} dealId={one(p.dealId) || null} />
      </section>
    </div>
  );
}
