// One click unsubscribe for email programs (the List-Unsubscribe-Post standard, RFC 8058).
// Email programs send a POST here when someone presses their built in "Unsubscribe" button.
import { unsubscribeByToken } from "@/lib/outreach/unsubscribe-handler";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await unsubscribeByToken(token);
  return new Response(result === "invalid" ? "Invalid link" : "Unsubscribed", { status: result === "invalid" ? 400 : 200 });
}
