// The one place the rest of the app talks to an AI service.
// To change provider, add a new implementation of AiProvider and return it from getAiProvider().
import type { z } from "zod";

export type StructuredRequest<T extends z.ZodType> = {
  system: string;
  user: string;
  // Shape the AI is asked to answer in. Kept simple so every provider can follow it.
  outputSchema: T;
  maxTokens?: number;
};

export type StructuredResponse = {
  data: unknown; // checked by the caller against the stricter rules before use
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export interface AiProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateStructured<T extends z.ZodType>(request: StructuredRequest<T>): Promise<StructuredResponse>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI is not set up yet. An admin needs to add the ANTHROPIC_API_KEY setting.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiAnswerError";
  }
}
