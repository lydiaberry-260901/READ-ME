"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { checkCode, finishSetup } from "./actions";

export function SetupForm({ qr, keyText, sealed }: { qr: string; keyText: string; sealed: string }) {
  const [state, action, pending] = useActionState(finishSetup, null);
  if (state?.ok && state.codes) {
    return (
      <div className="grid gap-5">
        <Notice tone="green" title="Two step sign in is on">Keep these recovery codes somewhere safe, such as a password manager. Each works once, if you lose your phone. They will not be shown again.</Notice>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas-deep p-4 font-mono text-sm">
          {state.codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <Link href="/" className="btn btn-primary no-underline">I have saved them. Continue</Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="secret" value={sealed} />
      <ol className="grid gap-5 text-sm">
        <li>
          <p className="font-medium">1. Scan this with your authenticator app</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="mt-3 rounded-md" />
          <p className="mt-3 text-xs text-fg-muted">Or type this key into the app:</p>
          <code className="mt-1 block break-all rounded border border-line bg-canvas-deep px-3 py-2 font-mono text-sm">{keyText}</code>
        </li>
        <li>
          <label htmlFor="ts-code" className="block font-medium">2. Enter the six digit code it shows</label>
          <input id="ts-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className="field mt-2 block w-40 text-center font-mono text-lg tracking-widest" />
        </li>
      </ol>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Checking" : "Turn on two step sign in"}</button></div>
      {state && !state.ok ? <Notice tone="red">{state.message}</Notice> : null}
    </form>
  );
}

export function CodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(checkCode, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="ts-verify" className="label">Code</label>
        <input id="ts-verify" name="code" autoComplete="one-time-code" autoFocus required maxLength={20} className="field w-48 text-center font-mono text-lg tracking-widest" />
        <p className="mt-1 text-xs text-fg-muted">Or enter one of your recovery codes.</p>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Checking" : "Continue"}</button></div>
      {state && !state.ok ? <Notice tone="red">{state.message}</Notice> : null}
    </form>
  );
}
