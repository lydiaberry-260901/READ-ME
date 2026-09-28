// Claude API implementation of the AI provider.
// Uses the API's structured answer format, so replies always come back as data in a fixed shape.
// If Claude declines a request, the API's default fallback model tries it instead.
// Anthropic does not train its models on API data by default.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AiAnswerError, AiNotConfiguredError, type AiProvider, type StructuredRequest, type StructuredResponse } from "./provider";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

export class ClaudeProvider implements AiProvider {
  readonly name = "claude";
  private client: Anthropic | null = null;

  constructor(private readonly model = process.env.AI_MODEL || DEFAULT_CLAUDE_MODEL) {}

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.isConfigured()) throw new AiNotConfiguredError();
    this.client ??= new Anthropic({ timeout: 120_000, maxRetries: 2 });
    return this.client;
  }

  async generateStructured<T extends z.ZodType>(request: StructuredRequest<T>): Promise<StructuredResponse> {
    const response = await this.getClient().beta.messages.parse({
      model: this.model,
      max_tokens: request.maxTokens ?? 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(request.outputSchema) },
      // The instructions (including the knowledge library) rarely change, so they are cached
      // by the API for a few minutes, which makes repeated requests cheaper and faster.
      system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: request.user }],
    });

    if (response.stop_reason === "refusal") {
      throw new AiAnswerError("The AI declined to answer this request.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiAnswerError("The AI answer was cut short. Please try again.");
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new AiAnswerError("The AI answer was not in the expected format.");
    }

    return {
      data: response.parsed_output,
      model: response.model,
      inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
    };
  }
}
