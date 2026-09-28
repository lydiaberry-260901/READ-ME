// The result every form action returns, so screens can show a clear message.
import { z } from "zod";
import { AccessDeniedError } from "@/lib/session";
import { AiAnswerError, AiNotConfiguredError } from "@/lib/ai";
import { logger } from "@/lib/logger";

export type ActionResult = { ok: boolean; message: string; link?: string };

export function failure(error: unknown): ActionResult {
  if (error instanceof AccessDeniedError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? "Please check the form." };
  if (error instanceof AiNotConfiguredError) return { ok: false, message: error.message };
  if (error instanceof AiAnswerError) return { ok: false, message: `${error.message} Nothing was saved. Please try again.` };
  logger.error("Action failed", { error: String(error) });
  return { ok: false, message: "Something went wrong. Please try again." };
}

/** Empty form fields become null. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null));
