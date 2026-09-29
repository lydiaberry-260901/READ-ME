// Two step sign in with an authenticator app (the standard time based six digit codes, RFC 6238),
// such as Microsoft Authenticator or Google Authenticator. Required for admins and the data
// protection lead, as they can see everyone's personal data.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Actor } from "@/lib/permissions";

const STEP_SECONDS = 30;
const DIGITS = 6;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
/** How long a sign in stays verified. Matches the length of a sign in (12 hours). */
export const TWO_STEP_SESSION_HOURS = 12;

export function needsTwoStep(actor: Pick<Actor, "role" | "isDataProtectionLead">) {
  return actor.role === "ADMIN" || Boolean(actor.isDataProtectionLead);
}

// Authenticator apps share the secret as base32 text.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code for a time step (a 30 second window). */
export function codeForStep(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const stepAt = (now: Date) => Math.floor(now.getTime() / 1000 / STEP_SECONDS);

/**
 * Checks a code, allowing one step either side for a phone clock that is slightly out.
 * Returns the step it matched, or null. A step at or before `lastStep` is refused, so a code
 * seen over someone's shoulder cannot be used again.
 */
export function matchCode(secret: Buffer, code: string, now: Date, lastStep: number | null) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = stepAt(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(codeForStep(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

export function newSecret() {
  return base32Encode(randomBytes(20));
}

export function otpauthUri(secret: string, email: string, issuer = "Moca CRM") {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?${new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) })}`;
}

const hashRecovery = (code: string) => createHash("sha256").update(code.replace(/\s/g, "").toLowerCase()).digest("hex");

/** Ten one time recovery codes, for when the phone is lost. Shown once; only hashes are kept. */
export function newRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)} ${raw.slice(5)}`;
  });
}

export class TwoStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwoStepError";
  }
}

/** Saves a new secret once the person has proved their app works by entering a code from it. */
export async function enableTwoStep(userId: string, secret: string, code: string, now = new Date()) {
  const step = matchCode(base32Decode(secret), code, now, null);
  if (step === null) throw new TwoStepError("That code did not match. Check the time on your phone is set automatically, and try the newest code.");
  const recovery = newRecoveryCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { twoStepSecretEnc: encrypt(secret), twoStepEnabledAt: now, twoStepRecoveryHashes: recovery.map(hashRecovery), twoStepLastStep: step, twoStepFailures: 0, twoStepLockedUntil: null },
  });
  return recovery;
}

/**
 * Checks a code (or a recovery code) at sign in. Too many wrong codes lock two step sign in for
 * 15 minutes. On success, the sign in is recorded as verified on the server.
 */
export async function verifyTwoStep(input: { userId: string; sessionId: string; code: string; now?: Date }) {
  const now = input.now ?? new Date();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (!user.twoStepSecretEnc) throw new TwoStepError("Two step sign in is not set up yet.");
  if (user.twoStepLockedUntil && user.twoStepLockedUntil > now) {
    throw new TwoStepError(`Too many wrong codes. Try again after ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(user.twoStepLockedUntil)}.`);
  }

  const code = input.code.trim();
  let usedRecovery = false;
  let step: number | null = null;
  if (/^\d{3}\s?\d{3}$/.test(code)) {
    step = matchCode(base32Decode(decrypt(user.twoStepSecretEnc)), code, now, user.twoStepLastStep);
  } else if (user.twoStepRecoveryHashes.includes(hashRecovery(code))) {
    usedRecovery = true;
  }

  if (step === null && !usedRecovery) {
    const failures = user.twoStepFailures + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failures >= MAX_FAILURES ? { twoStepFailures: 0, twoStepLockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { twoStepFailures: failures },
    });
    if (user.organisationId) {
      await prisma.auditLog.create({ data: { organisationId: user.organisationId, userId: user.id, action: "two_step.failed", details: { locked: failures >= MAX_FAILURES } } });
    }
    throw new TwoStepError(failures >= MAX_FAILURES ? `Too many wrong codes. Two step sign in is locked for ${LOCK_MINUTES} minutes.` : "That code did not match. Try the newest code in your app.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoStepFailures: 0,
      twoStepLockedUntil: null,
      ...(step !== null ? { twoStepLastStep: step } : {}),
      ...(usedRecovery ? { twoStepRecoveryHashes: user.twoStepRecoveryHashes.filter((h) => h !== hashRecovery(code)) } : {}),
    },
  });
  await prisma.twoStepSession.upsert({
    where: { id: input.sessionId },
    update: { verifiedAt: now, expiresAt: new Date(now.getTime() + TWO_STEP_SESSION_HOURS * 3_600_000) },
    create: { id: input.sessionId, userId: user.id, verifiedAt: now, expiresAt: new Date(now.getTime() + TWO_STEP_SESSION_HOURS * 3_600_000) },
  });
  // Tidy away old verified sign ins.
  await prisma.twoStepSession.deleteMany({ where: { userId: user.id, expiresAt: { lt: now } } });
  if (user.organisationId) {
    await prisma.auditLog.create({ data: { organisationId: user.organisationId, userId: user.id, action: usedRecovery ? "two_step.recovery_code_used" : "two_step.verified" } });
  }
  return { usedRecovery, recoveryCodesLeft: usedRecovery ? user.twoStepRecoveryHashes.length - 1 : user.twoStepRecoveryHashes.length };
}

export async function isTwoStepVerified(userId: string, sessionId: string | undefined, now = new Date()) {
  if (!sessionId) return false;
  const s = await prisma.twoStepSession.findUnique({ where: { id: sessionId } });
  return Boolean(s && s.userId === userId && s.expiresAt > now);
}

/** Removes two step sign in, for example when an admin loses their phone. They set it up again at next sign in. */
export async function resetTwoStep(userId: string) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { twoStepSecretEnc: null, twoStepEnabledAt: null, twoStepRecoveryHashes: [], twoStepLastStep: null, twoStepFailures: 0, twoStepLockedUntil: null } }),
    prisma.twoStepSession.deleteMany({ where: { userId } }),
  ]);
}
