"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signOut } from "@/auth";
import { decrypt } from "@/lib/crypto";
import { getSessionState } from "@/lib/session";
import { enableTwoStep, TWO_STEP_SESSION_HOURS, TwoStepError, verifyTwoStep } from "@/lib/two-step";

type SetupResult = { ok: boolean; message: string; codes?: string[] };

/** Finishes setting up an authenticator app. The secret comes back encrypted, so it cannot be swapped. */
export async function finishSetup(_prev: SetupResult | null, formData: FormData): Promise<SetupResult> {
  const state = await getSessionState();
  if (state.status !== "two_step_needed" || state.enrolled || !state.sessionId) return { ok: false, message: "Please sign in again." };
  try {
    const { secret, code } = z.object({ secret: z.string().min(10), code: z.string().max(20) }).parse(Object.fromEntries(formData));
    const plain = decrypt(secret);
    const now = new Date();
    const codes = await enableTwoStep(state.user.id, plain, code, now);
    // Setting it up with a working code counts as passing the second step for this sign in.
    await prisma.twoStepSession.create({ data: { id: state.sessionId, userId: state.user.id, verifiedAt: now, expiresAt: new Date(now.getTime() + TWO_STEP_SESSION_HOURS * 3_600_000) } });
    await prisma.auditLog.create({ data: { organisationId: state.user.organisationId, userId: state.user.id, action: "two_step.enabled" } });
    return { ok: true, message: "Two step sign in is on.", codes };
  } catch (error) {
    if (error instanceof TwoStepError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: "Enter the six digit code from your app." };
    return { ok: false, message: "Something went wrong. Please start again." };
  }
}

export async function checkCode(_prev: { ok: boolean; message: string } | null, formData: FormData) {
  const state = await getSessionState();
  if (state.status === "ok") redirect("/");
  if (state.status !== "two_step_needed" || !state.sessionId) return { ok: false, message: "Please sign in again." };
  try {
    const code = z.string().min(6).max(20).parse(formData.get("code"));
    await verifyTwoStep({ userId: state.user.id, sessionId: state.sessionId, code });
  } catch (error) {
    if (error instanceof TwoStepError) return { ok: false, message: error.message };
    return { ok: false, message: "Enter the six digit code from your app, or a recovery code." };
  }
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function leave() {
  await signOut({ redirectTo: "/signin" });
}
