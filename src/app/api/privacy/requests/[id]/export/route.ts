// Downloads everything held about the person a request is about, as one JSON file.
// JSON is a common format other systems can read, so it also answers a request for a copy.
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { subjectAccessExport } from "@/lib/privacy/subject";
import { fileDate } from "@/lib/csv";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (!can(user, "privacy.access")) return new Response("You do not have permission to do that.", { status: 403 });
  const { id } = await params;
  const r = await prisma.dataRequest.findFirst({ where: { id, organisationId: user.organisationId } });
  if (!r) return new Response("That request could not be found.", { status: 404 });
  if (!r.contactId) return new Response("Link the request to their contact record first.", { status: 400 });

  const data = await subjectAccessExport(user.organisationId, r.contactId);
  await audit({ organisationId: user.organisationId, userId: user.id, action: "export.subject_access", entityType: "DataRequest", entityId: r.id, details: { contactId: r.contactId } });
  const safeName = r.requesterName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "person";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="data-for-${safeName}-${fileDate()}.json"`,
      "cache-control": "no-store",
    },
  });
}
