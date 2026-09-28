// Sends alert emails through an SMTP mail server (for example Hostinger's mail service).
// Settings: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and ALERT_FROM.
// While developing, EMAIL_TRANSPORT="log" prints emails to the terminal instead of sending them.
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Alert emails are not set up yet. An admin needs to add the SMTP settings.");
    this.name = "EmailNotConfiguredError";
  }
}

let transporter: Transporter | null = null;

export function emailMode(): "smtp" | "log" | "none" {
  if (process.env.EMAIL_TRANSPORT === "log" && process.env.NODE_ENV !== "production") return "log";
  if (process.env.SMTP_HOST && process.env.ALERT_FROM) return "smtp";
  return "none";
}

export async function sendEmail(message: { to: string; subject: string; text: string; html?: string }) {
  const mode = emailMode();
  if (mode === "log") {
    logger.info("Email (not sent, development log only)", { to: message.to, subject: message.subject });
    return;
  }
  if (mode === "none") throw new EmailNotConfiguredError();
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transporter.sendMail({ from: process.env.ALERT_FROM, to: message.to, subject: message.subject, text: message.text, html: message.html });
}
