// Entry point for every AI feature. Handles choosing the provider, checking answers,
// retrying once if an answer breaks the rules, and recording usage and cost.
import type { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ClaudeProvider } from "./claude";
import { costMicroUsd } from "./pricing";
import { AiAnswerError, type AiProvider } from "./provider";

export { AiAnswerError, AiNotConfiguredError } from "./provider";
export type { AiProvider } from "./provider";

let provider: AiProvider = new ClaudeProvider();

export function getAiProvider(): AiProvider {
  return provider;
}

/** Tests use this to swap in a pretend AI. */
export function setAiProviderForTests(p: AiProvider) {
  provider = p;
}

export function aiIsConfigured(): boolean {
  return provider.isConfigured();
}

export type AiTask<TOut extends z.ZodType, TResult> = {
  feature: string;
  promptVersion: string;
  organisationId: string | null;
  userId: string | null;
  system: string;
  user: string;
  outputSchema: TOut;
  /** Stricter checks applied to the answer before it is used. Returns the checked result or throws AiAnswerError. */
  check: (data: unknown) => TResult;
  maxTokens?: number;
};

export async function runAiTask<TOut extends z.ZodType, TResult>(
  task: AiTask<TOut, TResult>,
): Promise<{ result: TResult; model: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let model = "unknown";
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const response = await provider.generateStructured({
        system: task.system,
        user: task.user,
        outputSchema: task.outputSchema,
        maxTokens: task.maxTokens,
      });
      model = response.model;
      inputTokens = response.inputTokens;
      outputTokens = response.outputTokens;
      const result = task.check(response.data);
      await recordUsage(task, { model, inputTokens, outputTokens, success: true });
      return { result, model };
    } catch (error) {
      lastError = error;
      await recordUsage(task, { model, inputTokens, outputTokens, success: false, error: String(error) });
      // Only retry when the answer broke the rules. Other failures are passed straight back.
      if (!(error instanceof AiAnswerError)) throw error;
      logger.warn("AI answer failed the checks", { feature: task.feature, attempt, error: error.message });
    }
  }
  throw lastError;
}

async function recordUsage(
  task: Pick<AiTask<z.ZodType, unknown>, "feature" | "promptVersion" | "organisationId" | "userId">,
  r: { model: string; inputTokens: number; outputTokens: number; success: boolean; error?: string },
) {
  try {
    await prisma.aiUsage.create({
      data: {
        organisationId: task.organisationId,
        userId: task.userId,
        feature: task.feature,
        promptVersion: task.promptVersion,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costMicroUsd: costMicroUsd(r.model, r.inputTokens, r.outputTokens),
        success: r.success,
        error: r.error?.slice(0, 500),
      },
    });
  } catch (error) {
    logger.error("Could not record AI usage", { error: String(error) });
  }
}
