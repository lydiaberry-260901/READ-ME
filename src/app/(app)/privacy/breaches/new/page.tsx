import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { NewBreachForm } from "../../forms";

export const metadata = { title: "Report a breach" };

export default async function NewBreachPage() {
  await requireCapability("privacy.access");
  return (
    <div className="grid max-w-3xl gap-6">
      <p className="text-sm"><Link href="/privacy/breaches">Breaches</Link> <span className="text-fg-muted">/ Report a breach</span></p>
      <h1 className="text-2xl font-semibold">Report a breach</h1>
      <p className="text-sm text-fg-muted">Record what you know now. You can add details as you find them out. Do not wait for the full picture: the 72 hours run from when we found out.</p>
      <section className="card p-6"><NewBreachForm /></section>
    </div>
  );
}
