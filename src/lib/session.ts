// Who is signed in, and what they may do. Used by every page and every action.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadActor, type LoadedActor } from "@/lib/actor";
import { can, type Capability } from "@/lib/permissions";

export type CurrentUser = LoadedActor;

/** The signed in person, read fresh from the database once per request. Null if not signed in. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return loadActor(userId);
});

/** Use at the top of every signed in page. Sends people who are not signed in to the sign in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
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
  const user = await getCurrentUser();
  if (!user) throw new AccessDeniedError("Please sign in again.");
  if (capability && !can(user, capability)) throw new AccessDeniedError();
  return user;
}
