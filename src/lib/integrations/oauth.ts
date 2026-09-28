// Connecting a person's own Google or Microsoft email and calendar, asking only for the access
// each feature needs. Uses PKCE (a one time proof key) and a check value to make the handshake safe.
import { createHash, randomBytes } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto";
import { providerFetch } from "./http";

export type ProviderId = "google" | "microsoft";
export type ConnectionKind = "email" | "calendar";

// The least access needed. Email: read messages (for the snippet and matching) and send.
// Calendar: events only. Microsoft also needs offline_access to keep working between sign ins.
const SCOPES: Record<ProviderId, Record<ConnectionKind, string[]>> = {
  google: {
    email: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    calendar: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"],
  },
  microsoft: {
    email: ["openid", "email", "offline_access", "User.Read", "Mail.Read", "Mail.Send"],
    calendar: ["openid", "email", "offline_access", "User.Read", "Calendars.ReadWrite"],
  },
};

export function scopesFor(provider: ProviderId, kind: ConnectionKind) {
  return SCOPES[provider][kind];
}

function microsoftTenant() {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
  return issuer.match(/login\.microsoftonline\.com\/([^/]+)/)?.[1] ?? "common";
}

export function providerConfig(provider: ProviderId) {
  if (provider === "google") {
    return {
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
    };
  }
  const tenant = microsoftTenant();
  return {
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
    authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}

export function providerIsConfigured(provider: ProviderId) {
  const c = providerConfig(provider);
  return Boolean(c.clientId && c.clientSecret);
}

export function redirectUri(provider: ProviderId) {
  return `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/api/connect/callback/${provider}`;
}

export type OAuthState = { state: string; verifier: string; userId: string; provider: ProviderId; kind: ConnectionKind; expires: number };

/** Starts the handshake. The state is kept in an encrypted cookie, never in the address. */
export function startConnection(provider: ProviderId, kind: ConnectionKind, userId: string) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  const c = providerConfig(provider);
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: scopesFor(provider, kind).join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "false");
  } else {
    params.set("prompt", "select_account");
  }
  const cookie: OAuthState = { state, verifier, userId, provider, kind, expires: Date.now() + 10 * 60_000 };
  return { url: `${c.authUrl}?${params}`, cookieValue: encrypt(JSON.stringify(cookie)) };
}

export function readStateCookie(value: string | undefined): OAuthState | null {
  if (!value) return null;
  try {
    const s = JSON.parse(decrypt(value)) as OAuthState;
    return s.expires > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string | null; idToken: string | null };

async function tokenRequest(provider: ProviderId, body: Record<string, string>): Promise<TokenSet> {
  const c = providerConfig(provider);
  const res = await providerFetch(c.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }).toString(),
  });
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string; id_token?: string };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000),
    scope: json.scope ?? null,
    idToken: json.id_token ?? null,
  };
}

export function exchangeCode(provider: ProviderId, code: string, verifier: string) {
  return tokenRequest(provider, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri(provider) });
}

export function refreshTokens(provider: ProviderId, refreshToken: string, kind: ConnectionKind) {
  return tokenRequest(provider, { grant_type: "refresh_token", refresh_token: refreshToken, ...(provider === "microsoft" ? { scope: scopesFor(provider, kind).join(" ") } : {}) });
}

/** Reads the email address from the sign in token the provider returns. */
export function emailFromIdToken(idToken: string | null): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string; preferred_username?: string };
    return (payload.email ?? payload.preferred_username ?? "").toLowerCase() || null;
  } catch {
    return null;
  }
}
