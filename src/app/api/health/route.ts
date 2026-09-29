// A simple check the server (or an uptime monitor) can call to see the CRM is working.
// Says only whether things are running; never any data.
import { prisma } from "@/lib/db";
import { getAutomationStatus } from "@/lib/automations";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  let worker: "running" | "not seen recently" | "unknown" = "unknown";
  if (database) {
    const status = await getAutomationStatus();
    // The worker checks in every 15 minutes.
    worker = status.workerLastSeen && Date.now() - new Date(status.workerLastSeen).getTime() < 20 * 60_000 ? "running" : "not seen recently";
  }
  const ok = database && worker === "running";
  return Response.json({ ok, database: database ? "connected" : "not reachable", worker }, { status: database ? 200 : 503, headers: { "cache-control": "no-store" } });
}
