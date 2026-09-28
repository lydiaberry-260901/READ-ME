// Live feed for the home page.
import { getCurrentUser } from "@/lib/session";
import { getFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  return Response.json({ items: await getFeed(user) }, { headers: { "cache-control": "no-store" } });
}
