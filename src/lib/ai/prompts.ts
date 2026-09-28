// Prompts live as separate, versioned files in the prompts/ folder, for example
// prompts/company-summary.v1.md. To change a prompt, add a new version and update the version here,
// so saved results always show which version produced them.
import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

export function loadPrompt(name: string, version: number): string {
  const file = `${name}.v${version}.md`;
  const cached = cache.get(file);
  if (cached) return cached;
  const text = readFileSync(path.join(process.cwd(), "prompts", file), "utf8");
  cache.set(file, text);
  return text;
}

/** Replaces {{name}} placeholders in a prompt. */
export function fillPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}
