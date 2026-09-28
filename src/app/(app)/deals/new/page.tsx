import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { visibleWhere } from "@/lib/permissions";
import { loadPickerOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { NewDealForm } from "./NewDealForm";

export const metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const user = await requireUser();
  const { companyId } = await searchParams;
  const [companies, options] = await Promise.all([
    prisma.company.findMany({ where: visibleWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" }, take: 3000 }),
    loadPickerOptions(user),
  ]);
  return (
    <>
      <PageHeader title="New deal" description="It starts in the first stage of the pipeline. Fill in the qualification details as you learn them." />
      <section className="card max-w-3xl p-6">
        <NewDealForm companies={companies} owners={options.assignableOwners} defaultCompanyId={companies.some((c) => c.id === companyId) ? companyId! : ""} me={user.id} />
      </section>
    </>
  );
}
