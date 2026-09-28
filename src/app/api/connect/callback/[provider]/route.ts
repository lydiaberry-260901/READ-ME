// Finishes connecting an email or calendar account: checks the handshake, stores the sign in
// details encrypted, and starts a first sync.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { emailFromIdToken, exchangeCode, readStateCookie, type ProviderId } from "@/lib/integrations/oauth";
import { providerFetch } from "@/lib/integrations/http";
import { enqueue } from "@/jobs/boss";
import { QUEUES } from "@/jobs/queues";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "moca_connect";

async function microsoftEmail(accessToken: string) {
  const me = (await (await providerFetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { accessToken })).json()) as { mail?: string; userPrincipalName?: string };
  return (me.mail ?? me.userPrincipalName ?? "").toLowerCase() || null;
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const url = new URL(request.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings/connections?${q}`, url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/connect" });
    return res;
  };
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", url));
  const { provider } = await params;
  const saved = readStateCookie((await cookies()).get(STATE_COOKIE)?.value);

  if (url.searchParams.get("error")) return back("error=declined");
  const code = url.searchParams.get("code");
  // The check value must match, the handshake must be recent, and it must be the same person and service.
  if (!saved || !code || saved.state !== url.searchParams.get("state") || saved.userId !== user.id || saved.provider !== provider) {
    return back("error=expired");
  }

  try {
    const tokens = await exchangeCode(provider as ProviderId, code, saved.verifier);
    const emailAddress = emailFromIdToken(tokens.idToken) ?? (provider === "microsoft" ? await microsoftEmail(tokens.accessToken) : null);
    if (!emailAddress) return back("error=no-email");
    const data = {
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scope,
      status: "ACTIVE" as const,
      lastError: null,
    };
    const providerEnum = provider === "google" ? ("GOOGLE" as const) : ("MICROSOFT" as const);
    const where = { userId_provider_emailAddress: { userId: user.id, provider: providerEnum, emailAddress } };
    if (saved.kind === "email") {
      const account = await prisma.emailAccount.upsert({ where, update: data, create: { ...data, userId: user.id, provider: providerEnum, emailAddress } });
      await enqueue(QUEUES.mailSync, { accountId: account.id }, { singletonKey: `mail:${account.id}` }).catch(() => undefined);
    } else {
      const account = await prisma.calendarAccount.upsert({ where, update: data, create: { ...data, userId: user.id, provider: providerEnum, emailAddress } });
      await enqueue(QUEUES.calendarSync, { accountId: account.id }, { singletonKey: `calendar:${account.id}` }).catch(() => undefined);
    }
    await audit({ organisationId: user.organisationId, userId: user.id, action: `connection.${saved.kind}_connected`, details: { provider, emailAddress } });
    return back(`connected=${saved.kind}`);
  } catch (error) {
    logger.error("Could not finish connecting an account", { provider, error: String(error) });
    return back("error=failed");
  }
}
