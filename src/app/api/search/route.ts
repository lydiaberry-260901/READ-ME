// Quick search for the Ctrl+K command bar. Only returns records the person is allowed to see.
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { visibleWhere } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ results: [] });

  const where = visibleWhere(user);
  const contains = { contains: q, mode: "insensitive" as const };
  const [companies, contacts, deals] = await Promise.all([
    prisma.company.findMany({ where: { AND: [where, { OR: [{ name: contains }, { domain: { contains: q.toLowerCase() } }] }] }, select: { id: true, name: true, domain: true }, take: 5 }),
    prisma.contact.findMany({
      where: { AND: [where, { OR: [{ firstName: contains }, { lastName: contains }, { emailNormalised: { contains: q.toLowerCase() } }] }] },
      select: { id: true, firstName: true, lastName: true, jobTitle: true, company: { select: { name: true } } },
      take: 5,
    }),
    prisma.deal.findMany({ where: { AND: [where, { OR: [{ name: contains }, { company: { name: contains } }] }] }, select: { id: true, name: true, company: { select: { name: true } } }, take: 5 }),
  ]);

  return Response.json(
    {
      results: [
        ...deals.map((d) => ({ kind: "Deal", title: d.name, detail: d.company.name, href: `/deals/${d.id}` })),
        ...companies.map((c) => ({ kind: "Company", title: c.name, detail: c.domain ?? "", href: `/companies/${c.id}` })),
        ...contacts.map((c) => ({ kind: "Contact", title: `${c.firstName} ${c.lastName ?? ""}`.trim(), detail: [c.jobTitle, c.company?.name].filter(Boolean).join(", "), href: `/contacts/${c.id}` })),
      ],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
