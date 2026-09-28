"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { actionUser } from "@/lib/session";
import { failure, optionalText, type ActionResult } from "@/lib/action-result";
import { OutreachBlockedError } from "@/lib/outreach/context";
import { createMeeting } from "@/lib/integrations/meetings";
import { startOfLondonDay } from "@/lib/calendar-view";

export async function bookMeeting(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let day: string;
  try {
    const me = await actionUser();
    const input = z
      .object({
        title: z.string().trim().min(2, "Give the meeting a title.").max(200),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
        time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time."),
        duration: z.coerce.number().int().min(10).max(480),
        location: optionalText(300),
        description: optionalText(2000),
        contactId: optionalText(40),
        dealId: optionalText(40),
        sendInvites: z.string().optional().transform((v) => v === "on"),
      })
      .parse(Object.fromEntries(formData));
    // The date and time are London time.
    const [h, m] = input.time.split(":").map(Number);
    const startAt = new Date(startOfLondonDay(input.date).getTime() + (h * 60 + m) * 60_000);
    await createMeeting(me, {
      title: input.title,
      startAt,
      durationMinutes: input.duration,
      location: input.location,
      description: input.description,
      contactId: input.contactId,
      dealId: input.dealId,
      sendInvites: input.sendInvites,
    });
    day = input.date;
  } catch (error) {
    if (error instanceof OutreachBlockedError) return { ok: false, message: error.message };
    return failure(error);
  }
  redirect(`/calendar?view=week&date=${day}`);
}
