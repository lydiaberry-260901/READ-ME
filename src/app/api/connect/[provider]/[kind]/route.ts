// Starts connecting a person's own email or calendar with Google or Microsoft.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { providerIsConfigured, startConnection, type ConnectionKind, type ProviderId } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "moca_connect";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string; kind: string }> }) {
  const user = await getCurrentUser();
  const base = new URL(request.url);
  if (!user) return NextResponse.redirect(new URL("/signin", base));
  const { provider, kind } = await params;
  if (!["google", "microsoft"].includes(provider) || !["email", "calendar"].includes(kind)) {
    return NextResponse.redirect(new URL("/settings/connections?error=unknown", base));
  }
  if (!providerIsConfigured(provider as ProviderId)) {
    return NextResponse.redirect(new URL("/settings/connections?error=not-configured", base));
  }
  const { url, cookieValue } = startConnection(provider as ProviderId, kind as ConnectionKind, user.id);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, cookieValue, { httpOnly: true, secure: base.protocol === "https:", sameSite: "lax", path: "/api/connect", maxAge: 600 });
  return res;
}
