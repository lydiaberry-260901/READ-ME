import { describe, expect, it } from "vitest";
import { decrypt, encrypt, maskEmail, normaliseEmail, normalisePhone, suppressionHash } from "@/lib/crypto";

describe("encryption of stored sign in details", () => {
  it("can read back what it encrypted", () => {
    const secret = "refresh-token-abc123";
    const stored = encrypt(secret);
    expect(stored).not.toContain(secret);
    expect(decrypt(stored)).toBe(secret);
  });

  it("gives a different result each time, even for the same value", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("refuses values that have been tampered with", () => {
    const stored = encrypt("value");
    const parts = stored.split(".");
    parts[3] = Buffer.from("changed").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});

describe("opt out list matching", () => {
  it("matches email addresses whatever their capitals or spaces", () => {
    expect(suppressionHash(normaliseEmail(" Grace.Okafor@Example.com "))).toBe(suppressionHash("grace.okafor@example.com"));
  });

  it("matches UK phone numbers written in different ways", () => {
    expect(normalisePhone("01632 960100")).toBe(normalisePhone("+44 1632 960100"));
    expect(normalisePhone("0044 1632 960100")).toBe("441632960100");
  });

  it("shows only a masked hint of an address", () => {
    expect(maskEmail("grace.okafor@example.com")).toBe("g***@example.com");
  });
});
