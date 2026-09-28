// Published prices per million tokens, in US dollars, used to estimate the cost of each AI request.
// Update this table if prices change or a new model is used.
export const MODEL_PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Cost in millionths of a dollar. Unknown models are priced at zero and should be added above. */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES_USD_PER_MILLION[model];
  if (!price) return 0;
  return Math.round(inputTokens * price.input + outputTokens * price.output);
}
