// Checks the server's settings before the live site starts. Problems stop the start; warnings are
// things that work but should be looked at.
type Env = Record<string, string | undefined>;

export type EnvReport = { problems: string[]; warnings: string[] };

const is32ByteKey = (v: string | undefined) => {
  if (!v) return false;
  try {
    return Buffer.from(v, "base64").length === 32;
  } catch {
    return false;
  }
};

export function checkEnvironment(env: Env): EnvReport {
  const problems: string[] = [];
  const warnings: string[] = [];
  const live = env.NODE_ENV === "production";

  if (!env.DATABASE_URL) problems.push("DATABASE_URL is missing: the address of the Postgres database.");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET is missing or too short. Create one with: npx auth secret");
  if (!is32ByteKey(env.ENCRYPTION_KEY)) problems.push("ENCRYPTION_KEY must be 32 random bytes in base64.");
  if (!is32ByteKey(env.SUPPRESSION_HMAC_KEY)) problems.push("SUPPRESSION_HMAC_KEY must be 32 random bytes in base64.");
  if (env.ENCRYPTION_KEY && env.ENCRYPTION_KEY === env.SUPPRESSION_HMAC_KEY) problems.push("ENCRYPTION_KEY and SUPPRESSION_HMAC_KEY must be different.");

  const hasGoogle = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const hasMicrosoft = Boolean(env.AUTH_MICROSOFT_ENTRA_ID_ID && env.AUTH_MICROSOFT_ENTRA_ID_SECRET);
  if (!hasGoogle && !hasMicrosoft) problems.push("No sign in is set up: add the Google or Microsoft sign in settings.");
  if (hasMicrosoft && (!env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || env.AUTH_MICROSOFT_ENTRA_ID_ISSUER.includes("/common/"))) {
    warnings.push("AUTH_MICROSOFT_ENTRA_ID_ISSUER is not tied to Moca's own tenant, so any Microsoft organisation's accounts can try to sign in (invitations still apply).");
  }

  if (live) {
    for (const key of ["APP_URL", "AUTH_URL"]) {
      const v = env[key];
      if (!v) problems.push(`${key} is missing: the live web address, for example https://crm.moca.energy`);
      else if (!v.startsWith("https://")) problems.push(`${key} must start with https:// on the live site.`);
    }
    if (env.AUTH_TRUST_HOST !== "true") problems.push("AUTH_TRUST_HOST must be true when running behind the web server (Nginx).");
    if (env.DEV_LOGIN_ENABLED === "true") warnings.push("DEV_LOGIN_ENABLED is true. It is ignored on the live site, but remove it to avoid confusion.");
    if (env.EMAIL_TRANSPORT === "log") problems.push("EMAIL_TRANSPORT=log is for development only. Remove it so alert emails are really sent.");
    if (!env.FIRST_ADMIN_EMAIL) warnings.push("FIRST_ADMIN_EMAIL is not set. Until it is, nobody can create the organisation on a new, empty database.");
  }

  if (!env.SMTP_HOST || !env.ALERT_FROM) (live ? problems : warnings).push("SMTP_HOST and ALERT_FROM are needed to send alert emails, reminders and morning summaries.");
  if (!env.ANTHROPIC_API_KEY) warnings.push("ANTHROPIC_API_KEY is not set: AI summaries, drafts and call reading are switched off.");
  if (!env.COMPANIES_HOUSE_API_KEY) warnings.push("COMPANIES_HOUSE_API_KEY is not set: Companies House lookups are switched off.");
  return { problems, warnings };
}
