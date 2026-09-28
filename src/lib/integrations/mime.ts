// Builds a plain text email in the standard format both Gmail and Outlook accept.
import { randomBytes } from "node:crypto";

function encodeHeader(value: string) {
  // Only encode when needed, so plain subjects stay readable.
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string) {
  return b64.replace(/.{1,76}/g, (line) => `${line}\r\n`);
}

export function newMessageId(domain = "moca-crm.local") {
  return `<${randomBytes(16).toString("hex")}@${domain}>`;
}

export type OutgoingEmail = {
  from: string;
  fromName?: string | null;
  to: string[];
  subject: string;
  text: string;
  messageId: string;
  unsubscribeUrl?: string | null;
  oneClickUrl?: string | null;
};

export function buildMime(m: OutgoingEmail): string {
  const from = m.fromName ? `${encodeHeader(m.fromName)} <${m.from}>` : m.from;
  const headers = [
    `From: ${from}`,
    `To: ${m.to.join(", ")}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Message-ID: ${m.messageId}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  // Lets email programs show their own one click unsubscribe button (RFC 2369 and RFC 8058).
  if (m.unsubscribeUrl) headers.push(`List-Unsubscribe: <${m.oneClickUrl ?? m.unsubscribeUrl}>`);
  if (m.oneClickUrl) headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  return `${headers.join("\r\n")}\r\n\r\n${wrap76(Buffer.from(m.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64"))}`;
}
