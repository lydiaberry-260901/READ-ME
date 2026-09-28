import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { visibleWhere } from "@/lib/permissions";
import { loadPickerOptions } from "@/lib/options";
import { londonTodayIso } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "../ContactForm";
import { createContact } from "../actions";

export const metadata = { title: "Add a contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const user = await requireUser();
  const { companyId } = await searchParams;
  const [options, companies] = await Promise.all([
    loadPickerOptions(user),
    prisma.company.findMany({ where: visibleWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" }, take: 2000 }),
  ]);
  return (
    <>
      <PageHeader title="Add a contact" description="Record business details only, and say where they came from." />
      <section className="card p-6">
        <ContactForm
          contact={{ companyId: companies.some((c) => c.id === companyId) ? companyId : null, ownerId: user.id, isShared: true, entityType: "UNKNOWN" }}
          isNew
          companies={companies}
          owners={options.assignableOwners}
          allowNoOwner={user.role !== "REP"}
          action={createContact}
          todayIso={londonTodayIso()}
        />
      </section>
    </>
  );
}
