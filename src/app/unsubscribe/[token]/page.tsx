import { readUnsubscribeToken } from "@/lib/outreach/unsubscribe";
import { unsubscribeByToken } from "@/lib/outreach/unsubscribe-handler";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { redirect } from "next/navigation";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ result?: string }> }) {
  const { token } = await params;
  const { result } = await searchParams;
  const parsed = readUnsubscribeToken(token);
  const org = parsed ? await prisma.organisation.findUnique({ where: { id: parsed.organisationId }, select: { name: true, privacyNoticeUrl: true } }) : null;

  async function confirm() {
    "use server";
    const outcome = await unsubscribeByToken(token);
    redirect(`/unsubscribe/${token}?result=${outcome}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Logo height={32} showProduct={false} />
        {!parsed || !org ? (
          <>
            <h1 className="mt-10 text-2xl font-semibold">This link does not work</h1>
            <p className="mt-2 text-ink-muted">
              It may have been copied incompletely. To stop hearing from us, reply to the email and ask us to stop, and we will do so straight away.
            </p>
          </>
        ) : result === "done" || result === "already" ? (
          <>
            <h1 className="mt-10 text-2xl font-semibold">You have been unsubscribed</h1>
            <p className="mt-2 text-ink-muted">
              Nobody at {org.name} will contact you again. We keep only the minimum needed to make sure of that.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-10 text-2xl font-semibold">Unsubscribe from {org.name}</h1>
            <p className="mt-2 text-ink-muted">Press the button and nobody at {org.name} will email or call you again.</p>
            <form action={confirm} className="mt-6">
              <button type="submit" className="btn btn-primary">Unsubscribe</button>
            </form>
          </>
        )}
        {org?.privacyNoticeUrl ? (
          <p className="mt-10 text-sm text-ink-muted">
            How we use personal information: <a href={org.privacyNoticeUrl}>{org.privacyNoticeUrl}</a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
