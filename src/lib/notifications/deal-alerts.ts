// Alert emails when a deal moves stage or is closed as won or lost.
// One alert per person per move (a stable key stops duplicates), saved with its status,
// sent by the worker, and retried automatically if sending fails.
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { formatDateTime, formatPounds } from "@/lib/format";
import { lossReasonLabels } from "@/lib/labels";
import type { LossReason } from "@/generated/prisma/enums";
import { sendEmail } from "./email";

export type StageAlertInput = {
  organisationId: string;
  historyId: string;
  deal: { id: string; name: string; value: number; ownerId: string };
  companyName: string;
  fromStage: string | null;
  toStage: string;
  toKind: "OPEN" | "WON" | "LOST";
  movedByName: string;
  movedAt: Date;
  lossReason?: LossReason | null;
  closeNote?: string | null;
  finalValue?: number | null;
};

export function dealLink(dealId: string): string {
  return `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/deals/${dealId}`;
}

/** The alert email's subject and text. Pure, so it can be tested. */
export function buildStageAlert(input: StageAlertInput): { subject: string; text: string; type: "DEAL_STAGE_CHANGED" | "DEAL_WON" | "DEAL_LOST" } {
  const type = input.toKind === "WON" ? "DEAL_WON" : input.toKind === "LOST" ? "DEAL_LOST" : "DEAL_STAGE_CHANGED";
  const value = formatPounds(input.toKind === "WON" && input.finalValue != null ? input.finalValue : input.deal.value);
  const subject =
    type === "DEAL_WON" ? `Won: ${input.deal.name} (${input.companyName}), ${value}`
      : type === "DEAL_LOST" ? `Lost: ${input.deal.name} (${input.companyName})`
        : `${input.deal.name} (${input.companyName}) moved to ${input.toStage}`;
  const lines = [
    `Deal: ${input.deal.name}`,
    `Company: ${input.companyName}`,
    `Old stage: ${input.fromStage ?? "None"}`,
    `New stage: ${input.toStage}`,
    `Value: ${value}`,
    `Moved by: ${input.movedByName}`,
    `When: ${formatDateTime(input.movedAt)}`,
  ];
  if (type === "DEAL_LOST" && input.lossReason) lines.push(`Reason lost: ${lossReasonLabels[input.lossReason]}`);
  if ((type === "DEAL_LOST" || type === "DEAL_WON") && input.closeNote) lines.push(`Note: ${input.closeNote}`);
  lines.push("", `Open the deal: ${dealLink(input.deal.id)}`, "", "You receive this because you own or follow this deal in Moca CRM.");
  return { subject, text: lines.join("\n"), type };
}

/** Saves one alert for the owner and each follower. Returns the ids of alerts that are new. */
export async function createStageAlerts(input: StageAlertInput, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<string[]> {
  const followers = await db.dealFollower.findMany({ where: { dealId: input.deal.id }, select: { userId: true } });
  const recipientIds = [...new Set([input.deal.ownerId, ...followers.map((f) => f.userId)])];
  const recipients = await db.user.findMany({ where: { id: { in: recipientIds }, active: true }, select: { id: true, email: true } });
  const { subject, text, type } = buildStageAlert(input);
  const created: string[] = [];
  for (const r of recipients) {
    const dedupeKey = `deal-stage:${input.historyId}:${r.id}`;
    const existing = await db.notification.findUnique({ where: { organisationId_dedupeKey: { organisationId: input.organisationId, dedupeKey } } });
    if (existing) continue;
    const n = await db.notification.create({
      data: {
        organisationId: input.organisationId,
        type,
        recipientUserId: r.id,
        recipientEmail: r.email,
        subject,
        bodyText: text,
        payload: { dealId: input.deal.id, historyId: input.historyId },
        dedupeKey,
      },
    });
    created.push(n.id);
  }
  return created;
}

/**
 * Sends one saved alert. Called by the worker. Records every attempt, and throws on failure
 * so the job list tries again later. Already sent alerts are never sent twice.
 */
export async function deliverNotification(notificationId: string) {
  const claimed = await prisma.notification.updateMany({
    where: { id: notificationId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });
  if (claimed.count === 0) return "skipped" as const;
  const n = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  try {
    await sendEmail({ to: n.recipientEmail, subject: n.subject, text: n.bodyText, html: n.bodyHtml ?? undefined });
    await prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
    return "sent" as const;
  } catch (error) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: "FAILED", lastError: String(error).slice(0, 500) } });
    throw error;
  }
}
