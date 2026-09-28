"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { failure, type ActionResult } from "@/lib/action-result";
import { enqueue } from "@/jobs/boss";
import { RUNNABLE } from "@/lib/automation-overview";
import type { QueueName } from "@/jobs/queues";

export async function runNow(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const me = await actionUser("jobs.run");
    const queue = z.string().parse(formData.get("queue")) as QueueName;
    if (!RUNNABLE.includes(queue)) return { ok: false, message: "That automation cannot be started by hand." };
    await enqueue(queue, null as never, { singletonKey: `manual:${queue}` });
    await audit({ organisationId: me.organisationId, userId: me.id, action: "automation.run_by_hand", details: { queue } });
    revalidatePath("/automations");
    return { ok: true, message: "Started. It runs as soon as the worker picks it up." };
  } catch (error) {
    return failure(error);
  }
}
