"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, type ActionResult } from "@/lib/action-result";
import { buildRetentionReview } from "@/lib/privacy/retention";

/** Makes the list straight away, instead of waiting for the 1st of the month. Deletes nothing. */
export async function buildListNow(_prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("settings.manage");
    const review = await buildRetentionReview(me.organisationId);
    await audit({ organisationId: me.organisationId, userId: me.id, action: "retention.list_built", details: { items: review ? (review.items as unknown[]).length : 0 } });
    revalidatePath("/privacy/retention");
    revalidatePath("/privacy");
    return { ok: true, message: review ? "List updated. Nothing is deleted until you approve it." : "Nothing is due for deletion." };
  } catch (error) {
    return failure(error);
  }
}
