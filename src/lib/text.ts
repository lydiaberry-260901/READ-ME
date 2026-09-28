// Small text helpers shared across the app.

/**
 * House style: no dashes used as punctuation. Turns " — ", " – " and " - " between words
 * into a comma, and leaves hyphens inside words (such as "multi-let") alone.
 */
export function removeDashPunctuation(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** Removes email addresses and phone numbers, so they are not sent to outside services. */
export function redactPersonalDetails(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, "[phone removed]");
}

export function countSentences(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .filter((s) => s.trim().length > 0).length;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
