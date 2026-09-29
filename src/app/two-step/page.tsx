import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSessionState } from "@/lib/session";
import { encrypt } from "@/lib/crypto";
import { newSecret, otpauthUri } from "@/lib/two-step";
import { Logo } from "@/components/Logo";
import { colours } from "@/design/tokens";
import { CodeForm, SetupForm } from "./forms";
import { leave } from "./actions";

export const metadata = { title: "Two step sign in" };
export const dynamic = "force-dynamic";

export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const state = await getSessionState();
  if (state.status === "signed_out") redirect("/signin");
  if (state.status === "ok") redirect("/");
  const { next } = await searchParams;

  let setup: { qr: string; key: string; sealed: string } | null = null;
  if (!state.enrolled) {
    const secret = newSecret();
    const qr = await QRCode.toDataURL(otpauthUri(secret, state.user.email), { margin: 1, width: 220, color: { dark: colours.canvas, light: colours.fg } });
    setup = { qr, key: secret.match(/.{1,4}/g)!.join(" "), sealed: encrypt(secret) };
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Logo height={36} />
        <h1 className="mt-10 text-2xl font-semibold">Two step sign in</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {state.enrolled
            ? "Enter the six digit code from the authenticator app on your phone."
            : "Your account can see everyone's personal data, so it needs a second step at sign in. Set it up once with an authenticator app, such as Microsoft Authenticator or Google Authenticator."}
        </p>
        <div className="mt-8">
          {setup ? <SetupForm qr={setup.qr} keyText={setup.key} sealed={setup.sealed} /> : <CodeForm next={next ?? "/"} />}
        </div>
        <form action={leave} className="mt-10 border-t border-line pt-5">
          <p className="text-xs text-fg-muted">Signed in as {state.user.email}. Lost your phone? Use a recovery code, or ask another admin to reset two step sign in for you.</p>
          <button type="submit" className="mt-3 text-sm text-fg-muted underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
