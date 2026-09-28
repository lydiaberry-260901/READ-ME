// Encryption for sensitive values such as email and calendar sign in details,
// and keyed hashing for the opt out (suppression) list.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function keyFrom(envName: string): Buffer {
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not set.`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${envName} must be 32 bytes, written in base64.`);
  return key;
}

/** Encrypts text. The result holds a version tag, the random start value, the check tag and the data. */
export function encrypt(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom("ENCRYPTION_KEY"), iv);
  const data = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Encrypted value is not in a known format.");
  const decipher = createDecipheriv(ALGORITHM, keyFrom("ENCRYPTION_KEY"), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Keeps digits only, and turns a leading UK 0 into 44 so 07700 900123 and +44 7700 900123 match. */
export function normalisePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `44${digits.slice(1)}`;
  return digits;
}

/** One way keyed hash, so the opt out list can be checked without storing readable addresses. */
export function suppressionHash(value: string): string {
  return createHmac("sha256", keyFrom("SUPPRESSION_HMAC_KEY")).update(value).digest("hex");
}

/** j***@example.com, so admins can recognise an opt out entry without seeing the full address. */
export function maskEmail(email: string): string {
  const [local, domain] = normaliseEmail(email).split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
