import Link from "next/link";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/ui";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { organisation: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });

  const valid = invite && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="card w-full max-w-md p-8">
        <Logo />
        {valid ? (
          <>
            <h1 className="mt-8 text-2xl font-semibold">You have been invited to {invite.organisation.name}</h1>
            <p className="mt-2 text-fg-muted">
              {invite.invitedBy.name ?? "An admin"} has invited <strong className="text-fg">{invite.email}</strong> to
              join as a {roleLabels[invite.role]}. The invitation lasts until {formatDate(invite.expiresAt)}.
            </p>
            <p className="mt-4 text-sm text-fg-muted">
              Sign in with the Google or Microsoft work account that uses this exact email address.
            </p>
            <Link href="/signin" className="btn btn-primary mt-6 w-full no-underline">
              Continue to sign in
            </Link>
          </>
        ) : (
          <div className="mt-8">
            <Notice tone="amber" title="This invitation can no longer be used">
              It may have expired, been used already, or been cancelled. Ask an admin to send you a new one.
            </Notice>
          </div>
        )}
      </div>
    </main>
  );
}
