import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { providerIsConfigured, scopesFor } from "@/lib/integrations/oauth";
import { Badge, Notice } from "@/components/ui";
import { disconnect, syncNow } from "./actions";

export const metadata = { title: "Email and calendar" };

const messages: Record<string, { tone: "green" | "red" | "amber"; text: string }> = {
  "connected=email": { tone: "green", text: "Email connected. Your emails with CRM contacts will appear within a few minutes." },
  "connected=calendar": { tone: "green", text: "Calendar connected. Your meetings will appear within a few minutes." },
  "error=declined": { tone: "amber", text: "The connection was cancelled, so nothing was changed." },
  "error=expired": { tone: "red", text: "The connection took too long or could not be checked. Please try again." },
  "error=no-email": { tone: "red", text: "We could not read the email address of that account. Please try again." },
  "error=failed": { tone: "red", text: "The connection could not be finished. Please try again." },
  "error=not-configured": { tone: "amber", text: "That service is not set up yet. An admin needs to add its sign in settings (see the README)." },
};

const accessDescriptions = {
  email: "Read your emails so those with CRM contacts can be saved, and send emails you choose to send from the CRM. Only the addresses, subject and a short snippet are kept, never attachments. Emails with nobody from the CRM are ignored.",
  calendar: "Read and create events in your calendar, so meetings with contacts appear in the CRM and meetings booked in the CRM appear in your calendar.",
};

type Account = { id: string; provider: "GOOGLE" | "MICROSOFT"; emailAddress: string; status: string; lastSyncedAt: Date | null; lastError: string | null };

function AccountCard({ kind, accounts }: { kind: "email" | "calendar"; accounts: Account[] }) {
  const title = kind === "email" ? "Email" : "Calendar";
  return (
    <section className="rounded-lg border border-line bg-panel" aria-label={title}>
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{accessDescriptions[kind]}</p>
      </header>
      {accounts.length ? (
        <ul className="divide-y divide-line">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {a.emailAddress}
                  <Badge>{a.provider === "GOOGLE" ? "Google" : "Microsoft"}</Badge>
                  {a.status === "ACTIVE" ? <Badge tone="green">Connected</Badge> : <Badge tone="red">Needs reconnecting</Badge>}
                </p>
                <p className="mt-1 text-xs text-fg-muted">{a.lastSyncedAt ? `Last brought up to date ${formatDateTime(a.lastSyncedAt)}` : "Not brought up to date yet"}</p>
                {a.lastError ? <p className="mt-1 text-xs text-red-text">{a.lastError}</p> : null}
              </div>
              <div className="flex gap-2">
                {a.status === "ACTIVE" ? (
                  <form action={syncNow}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="kind" value={kind} />
                    <button type="submit" className="btn btn-secondary py-1.5">Update now</button>
                  </form>
                ) : (
                  <a href={`/api/connect/${a.provider === "GOOGLE" ? "google" : "microsoft"}/${kind}`} className="btn btn-primary py-1.5 no-underline">Reconnect</a>
                )}
                <form action={disconnect}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="kind" value={kind} />
                  <button type="submit" className="btn btn-secondary py-1.5">Disconnect</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-fg-muted">Not connected.</p>
      )}
      <footer className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
        {(["google", "microsoft"] as const).map((p) => (
          providerIsConfigured(p) ? (
            <a key={p} href={`/api/connect/${p}/${kind}`} className="btn btn-secondary no-underline" title={`Asks for: ${scopesFor(p, kind).join(", ")}`}>
              Connect {p === "google" ? (kind === "email" ? "Gmail" : "Google Calendar") : (kind === "email" ? "Outlook" : "Outlook calendar")}
            </a>
          ) : (
            <span key={p} className="btn btn-secondary cursor-not-allowed opacity-50" title="Not set up yet">
              {p === "google" ? "Google" : "Microsoft"} not set up yet
            </span>
          )
        ))}
      </footer>
    </section>
  );
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const params = new URLSearchParams(await searchParams).toString();
  const note = messages[params];
  const [emails, calendars] = await Promise.all([
    prisma.emailAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.calendarAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <div className="grid max-w-4xl gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Email and calendar</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Connect your own work email and calendar. You sign in with Google or Microsoft directly; the CRM never sees your password, and it stores its access encrypted. Disconnect at any time.
        </p>
      </header>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      <AccountCard kind="email" accounts={emails} />
      <AccountCard kind="calendar" accounts={calendars} />
    </div>
  );
}
