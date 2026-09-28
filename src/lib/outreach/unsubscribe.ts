// Unsubscribe links. Each link names one contact and carries a keyed check value, so links
// cannot be guessed or changed to opt out someone else.
import { createHmac, timingSafeEqual } from "node:crypto";

function key(): string {
  const k = process.env.SUPPRESSION_HMAC_KEY;
  if (!k) throw new Error("SUPPRESSION_HMAC_KEY is not set.");
  return k;
}

function sign(organisationId: string, contactId: string): string {
  return createHmac("sha256", key()).update(`unsubscribe:${organisationId}:${contactId}`).digest("base64url").slice(0, 32);
}

export function createUnsubscribeToken(organisationId: string, contactId: string): string {
  return `${Buffer.from(`${organisationId}:${contactId}`).toString("base64url")}.${sign(organisationId, contactId)}`;
}

export function readUnsubscribeToken(token: string): { organisationId: string; contactId: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [organisationId, contactId, extra] = decoded.split(":");
  if (!organisationId || !contactId || extra !== undefined) return null;
  const expected = Buffer.from(sign(organisationId, contactId));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { organisationId, contactId };
}

export function unsubscribeUrl(organisationId: string, contactId: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return `${base}/unsubscribe/${createUnsubscribeToken(organisationId, contactId)}`;
}
