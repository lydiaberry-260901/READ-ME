import { redirect } from "next/navigation";
import { signIn, configuredProviders, devLoginEnabled } from "@/auth";
import { getSessionState } from "@/lib/session";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/ui";

export const metadata = { title: "Sign in" };

const errorMessages: Record<string, string> = {
  NotInvited: "This email address has not been invited yet. Ask an admin at Moca to send you an invitation.",
  Inactive: "Your account has been switched off. Ask an admin if you think this is a mistake.",
  NoEmail: "We could not read an email address from that account. Please try the other sign in option.",
  OAuthAccountNotLinked:
    "You have signed in before with a different service using this email address. Please sign in with that one.",
  CredentialsSignin: "That demo user could not be found. Run the demo data script first.",
};

const providerLabels: Record<string, string> = {
  google: "Sign in with Google",
  "microsoft-entra-id": "Sign in with Microsoft",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const state = await getSessionState();
  if (state.status === "ok") redirect("/");
  if (state.status === "two_step_needed") redirect("/two-step");
  const { error, callbackUrl } = await searchParams;
  const redirectTo = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  const oauthProviders = configuredProviders;
  const demoUsers = devLoginEnabled
    ? await prisma.user.findMany({
        where: { active: true, organisationId: { not: null } },
        select: { email: true, name: true, role: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 10,
      })
    : [];

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="hidden border-r border-line bg-canvas-deep px-14 py-12 lg:flex lg:flex-col">
        <div className="my-auto max-w-md">
          <Logo height={112} showProduct={false} />
          <h1 className="mt-12 text-3xl font-medium leading-snug">
            Our prospects, customers, deals and follow ups, in one place.
          </h1>
          <p className="mt-4 max-w-sm leading-relaxed text-fg-muted">
            For the team selling energy software to asset and ESG managers, property managers and occupiers.
          </p>
        </div>
        <p className="text-xs text-fg-muted">For Moca staff only.</p>
      </section>

      {/* Sign in */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo height={36} />
          </div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-fg-muted">Use your Moca work account.</p>

          {error ? (
            <div className="mt-6">
              <Notice tone="red" title="Sign in did not work">
                {errorMessages[error] ?? "Something went wrong. Please try again."}
              </Notice>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3">
            {oauthProviders.map((p) => (
              <form
                key={p.id}
                action={async () => {
                  "use server";
                  await signIn(p.id, { redirectTo });
                }}
              >
                <button type="submit" className="btn btn-secondary w-full py-2.5">
                  {providerLabels[p.id] ?? `Sign in with ${p.name}`}
                </button>
              </form>
            ))}
            {oauthProviders.length === 0 ? (
              <Notice tone="amber" title="Google and Microsoft sign in are not set up yet">
                An admin needs to add the Google and Microsoft sign in settings. The README explains how.
              </Notice>
            ) : null}
          </div>

          {devLoginEnabled ? (
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-sm font-semibold">Demo sign in (this computer only)</p>
              <p className="mt-1 text-xs text-fg-muted">
                Available while developing, never on the live site. Pick a fictional demo user to try each role.
              </p>
              {demoUsers.length === 0 ? (
                <p className="mt-3 text-sm text-fg-muted">No demo users yet. Run npm run db:seed first.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {demoUsers.map((u) => (
                    <li key={u.email}>
                      <form
                        action={async () => {
                          "use server";
                          await signIn("dev-login", { email: u.email, redirectTo });
                        }}
                      >
                        <button
                          type="submit"
                          className="flex w-full items-center justify-between rounded-md border border-line bg-panel px-3 py-2 text-left text-sm hover:border-line-strong"
                        >
                          <span>
                            <span className="font-medium">{u.name}</span>
                            <span className="block text-xs text-fg-muted">{u.email}</span>
                          </span>
                          <span className="text-xs text-fg-muted">{roleLabels[u.role]}</span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <p className="mt-10 text-xs text-fg-muted">
            This site uses only essential cookies, which keep you signed in.
          </p>
        </div>
      </section>
    </main>
  );
}
