import { beforeEach, describe, expect, it } from "vitest";
import { base32Decode, base32Encode, codeForStep, matchCode, needsTwoStep, otpauthUri, stepAt } from "@/lib/two-step";
import { checkEnvironment } from "@/lib/env-check";
import { mayBeFirstAdmin } from "@/lib/organisation";
import { rateLimit } from "@/lib/rate-limit";
import { buildCsp } from "@/proxy";

describe("authenticator codes", () => {
  // The official examples from RFC 6238 (SHA1), cut to six digits as authenticator apps show them.
  const secret = Buffer.from("12345678901234567890");
  it("match the published examples", () => {
    expect(codeForStep(secret, stepAt(new Date(59_000)))).toBe("287082");
    expect(codeForStep(secret, stepAt(new Date(1_111_111_109_000)))).toBe("081804");
    expect(codeForStep(secret, stepAt(new Date(1_234_567_890_000)))).toBe("005924");
  });

  it("round trips the key authenticator apps are given", () => {
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
    expect(base32Encode(secret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(otpauthUri("ABC", "jo@moca.energy")).toContain("otpauth://totp/Moca%20CRM%3Ajo%40moca.energy?secret=ABC");
  });

  it("accepts a code from the step either side, for a phone clock slightly out", () => {
    const now = new Date(1_234_567_890_000);
    const previous = codeForStep(secret, stepAt(now) - 1);
    expect(matchCode(secret, previous, now, null)).toBe(stepAt(now) - 1);
    expect(matchCode(secret, codeForStep(secret, stepAt(now) - 3), now, null)).toBeNull();
    expect(matchCode(secret, "12345", now, null)).toBeNull();
  });

  it("never accepts the same code twice", () => {
    const now = new Date(1_234_567_890_000);
    const code = codeForStep(secret, stepAt(now));
    expect(matchCode(secret, code, now, stepAt(now))).toBeNull();
  });

  it("is required for admins and the data protection lead only", () => {
    expect(needsTwoStep({ role: "ADMIN" })).toBe(true);
    expect(needsTwoStep({ role: "REP", isDataProtectionLead: true })).toBe(true);
    expect(needsTwoStep({ role: "MANAGER" })).toBe(false);
  });
});

describe("the live site's settings check", () => {
  const key = () => Buffer.alloc(32, Math.random() * 255).toString("base64");
  const good = {
    NODE_ENV: "production", DATABASE_URL: "postgresql://x", AUTH_SECRET: "a".repeat(40), ENCRYPTION_KEY: key(), SUPPRESSION_HMAC_KEY: Buffer.alloc(32, 7).toString("base64"),
    AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret", APP_URL: "https://crm.moca.energy", AUTH_URL: "https://crm.moca.energy", AUTH_TRUST_HOST: "true",
    SMTP_HOST: "smtp.example", ALERT_FROM: "Moca CRM <crm@moca.energy>", FIRST_ADMIN_EMAIL: "lead@moca.energy", ANTHROPIC_API_KEY: "k", COMPANIES_HOUSE_API_KEY: "k",
  };

  it("passes a complete set of settings", () => {
    expect(checkEnvironment(good)).toEqual({ problems: [], warnings: [] });
  });

  it("stops the live site starting with unsafe or missing settings", () => {
    const r = checkEnvironment({ ...good, APP_URL: "http://crm.moca.energy", ENCRYPTION_KEY: "short", EMAIL_TRANSPORT: "log", AUTH_GOOGLE_ID: undefined });
    expect(r.problems.join(" ")).toMatch(/APP_URL must start with https/);
    expect(r.problems.join(" ")).toMatch(/ENCRYPTION_KEY/);
    expect(r.problems.join(" ")).toMatch(/EMAIL_TRANSPORT=log/);
    expect(r.problems.join(" ")).toMatch(/No sign in is set up/);
  });

  it("refuses the same key for encryption and the opt out list", () => {
    expect(checkEnvironment({ ...good, SUPPRESSION_HMAC_KEY: good.ENCRYPTION_KEY }).problems).toHaveLength(1);
  });
});

describe("who can create the organisation on a new site", () => {
  it("is only the named first admin on the live site", () => {
    expect(mayBeFirstAdmin("Lead@Moca.energy", { NODE_ENV: "production", FIRST_ADMIN_EMAIL: "lead@moca.energy" })).toBe(true);
    expect(mayBeFirstAdmin("stranger@example.com", { NODE_ENV: "production", FIRST_ADMIN_EMAIL: "lead@moca.energy" })).toBe(false);
    expect(mayBeFirstAdmin("lead@moca.energy", { NODE_ENV: "production" })).toBe(false);
    expect(mayBeFirstAdmin("anyone@example.com", { NODE_ENV: "development" })).toBe(true);
  });
});

describe("rate limits and the content security policy", () => {
  it("allows a burst up to the limit, then asks the caller to wait", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000, 1000).ok).toBe(true);
    expect(rateLimit(key, 3, 60_000, 1000)).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(rateLimit(key, 3, 60_000, 62_000).ok).toBe(true);
  });

  it("only runs this site's scripts that carry the page's nonce, and cannot be framed", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(buildCsp("abc", true)).toContain("'unsafe-eval'");
  });
});

// Database tests: turning two step sign in on, checking codes, lock out and recovery codes.
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { enableTwoStep, isTwoStepVerified, newSecret, resetTwoStep, TwoStepError, verifyTwoStep } from "@/lib/two-step";

describe.skipIf(!hasTestDb)("two step sign in", () => {
  let userId = "";
  const now = new Date("2026-09-29T09:00:00Z");
  const secret = newSecret();
  const codeAt = (d: Date) => codeForStep(base32Decode(secret), stepAt(d));

  beforeEach(async () => {
    await resetTestDb();
    const org = await createOrganisation(testDb, "Moca");
    userId = (await testDb.user.create({ data: { email: "admin@moca.example", name: "Ada", organisationId: org.id, role: "ADMIN" } })).id;
  });

  it("is only turned on with a working code, and keeps the key encrypted", async () => {
    await expect(enableTwoStep(userId, secret, "000000", now)).rejects.toThrow(TwoStepError);
    const codes = await enableTwoStep(userId, secret, codeAt(now), now);
    expect(codes).toHaveLength(10);
    const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.twoStepSecretEnc).not.toContain(secret);
    expect(user.twoStepRecoveryHashes).toHaveLength(10);
    expect(user.twoStepRecoveryHashes.join()).not.toContain(codes[0].replace(" ", ""));
  });

  it("marks only this sign in as verified, on the server", async () => {
    await enableTwoStep(userId, secret, codeAt(now), now);
    const later = new Date(now.getTime() + 60_000);
    await verifyTwoStep({ userId, sessionId: "sign-in-a", code: codeAt(later), now: later });
    expect(await isTwoStepVerified(userId, "sign-in-a", later)).toBe(true);
    expect(await isTwoStepVerified(userId, "sign-in-b", later)).toBe(false);
    expect(await isTwoStepVerified(userId, "sign-in-a", new Date(later.getTime() + 13 * 3_600_000))).toBe(false);
  });

  it("locks after five wrong codes", async () => {
    await enableTwoStep(userId, secret, codeAt(now), now);
    const later = new Date(now.getTime() + 120_000);
    for (let i = 0; i < 5; i++) await expect(verifyTwoStep({ userId, sessionId: "s", code: "000000", now: later })).rejects.toThrow(TwoStepError);
    // Even the right code is refused while locked.
    await expect(verifyTwoStep({ userId, sessionId: "s", code: codeAt(later), now: later })).rejects.toThrow(/Too many wrong codes/);
    expect(await testDb.auditLog.count({ where: { action: "two_step.failed" } })).toBe(5);
  });

  it("accepts each recovery code once", async () => {
    const codes = await enableTwoStep(userId, secret, codeAt(now), now);
    const r = await verifyTwoStep({ userId, sessionId: "s1", code: codes[3], now });
    expect(r).toEqual({ usedRecovery: true, recoveryCodesLeft: 9 });
    await expect(verifyTwoStep({ userId, sessionId: "s2", code: codes[3], now })).rejects.toThrow(TwoStepError);
  });

  it("can be reset, which also ends verified sign ins", async () => {
    await enableTwoStep(userId, secret, codeAt(now), now);
    await verifyTwoStep({ userId, sessionId: "s", code: codeAt(new Date(now.getTime() + 60_000)), now: new Date(now.getTime() + 60_000) });
    await resetTwoStep(userId);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: userId } })).twoStepEnabledAt).toBeNull();
    expect(await testDb.twoStepSession.count()).toBe(0);
  });
});
