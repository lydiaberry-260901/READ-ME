import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isoDay } from "@/lib/calendar-view";
import { NewRequestForm } from "../../forms";

export const metadata = { title: "Record a request" };

export default async function NewRequestPage() {
  const user = await requireCapability("privacy.access");
  const people = await prisma.user.findMany({ where: { organisationId: user.organisationId, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  return (
    <div className="grid max-w-3xl gap-6">
      <p className="text-sm"><Link href="/privacy/requests">Requests</Link> <span className="text-fg-muted">/ Record a request</span></p>
      <h1 className="text-2xl font-semibold">Record a request about data</h1>
      <section className="card p-6">
        <NewRequestForm people={people.map((p) => ({ id: p.id, label: p.name ?? p.email }))} today={isoDay(new Date())} meId={user.id} />
      </section>
    </div>
  );
}
