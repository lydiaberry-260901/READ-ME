// One click unsubscribe for email programs (the List-Unsubscribe-Post standard, RFC 8058).
// Email programs send a POST here when someone presses their built in "Unsubscribe" button.
import { unsubscribeByToken } from "@/lib/outreach/unsubscribe-handler";
import { clientAddress, rateLimit, tooMany } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limit = rateLimit(`unsubscribe:${clientAddress(request.headers)}`, 30, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  const { token } = await params;
  const result = await unsubscribeByToken(token);
  return new Response(result === "invalid" ? "Invalid link" : "Unsubscribed", { status: result === "invalid" ? 400 : 200 });
}
