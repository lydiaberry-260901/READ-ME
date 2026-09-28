// Live status of the background automations, for the indicator in the top bar.
import { getCurrentUser } from "@/lib/session";
import { getAutomationStatus } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  return Response.json(await getAutomationStatus(), { headers: { "cache-control": "no-store" } });
}
