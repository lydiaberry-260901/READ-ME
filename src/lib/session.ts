// Who is signed in, and what they may do. Used by every page and every action.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { loadActor, type LoadedActor } from "@/lib/actor";
import { can, type Capability } from "@/lib/permissions";
import { isTwoStepVerified, needsTwoStep } from "@/lib/two-step";

export type CurrentUser = LoadedActor;

type SessionState =
  | { status: "signed_out" }
  | { status: "two_step_needed"; user: CurrentUser; sessionId: string | undefined; enrolled: boolean }
  | { status: "ok"; user: CurrentUser };

/**
 * The sign in state, read fresh from the database once per request. Admins and the data
 * protection lead must also have passed two step sign in for this sign in. The development demo
 * login skips it, and is never available on the live site.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const session = (await auth()) as (Session & { sid?: string; provider?: string | null }) | null;
  const userId = session?.user?.id;
  if (!userId) return { status: "signed_out" };
  const user = await loadActor(userId);
  if (!user) return { status: "signed_out" };
  // DEV_TWO_STEP=true makes the demo login ask too, to try two step sign in while developing.
  const skip = session.provider === "dev-login" && process.env.DEV_TWO_STEP !== "true";
  if (needsTwoStep(user) && !skip) {
    const verified = await isTwoStepVerified(user.id, session.sid);
    if (!verified) {
      const row = await prisma.user.findUnique({ where: { id: user.id }, select: { twoStepEnabledAt: true } });
      return { status: "two_step_needed", user, sessionId: session.sid, enrolled: Boolean(row?.twoStepEnabledAt) };
    }
  }
  return { status: "ok", user };
});

/** The signed in person, or null if not signed in or still to pass two step sign in. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const state = await getSessionState();
  return state.status === "ok" ? state.user : null;
});

/** Use at the top of every signed in page. Sends people to sign in, or to the second step. */
export async function requireUser(): Promise<CurrentUser> {
  const state = await getSessionState();
  if (state.status === "signed_out") redirect("/signin");
  if (state.status === "two_step_needed") redirect("/two-step");
  return state.user;
}

/** Use on pages that need a particular permission. */
export async function requireCapability(capability: Capability): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, capability)) redirect("/no-access");
  return user;
}

export class AccessDeniedError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/** Use at the top of every server action. Throws rather than redirecting. */
export async function actionUser(capability?: Capability): Promise<CurrentUser> {
  const state = await getSessionState();
  if (state.status === "signed_out") throw new AccessDeniedError("Please sign in again.");
  if (state.status === "two_step_needed") throw new AccessDeniedError("Please complete two step sign in first.");
  const user = state.user;
  if (capability && !can(user, capability)) throw new AccessDeniedError();
  return user;
}
