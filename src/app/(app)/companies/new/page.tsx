import { requireUser } from "@/lib/session";
import { loadPickerOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { CompanyForm } from "../CompanyForm";
import { createCompany } from "../actions";

export const metadata = { title: "Add a company" };

export default async function NewCompanyPage() {
  const user = await requireUser();
  const options = await loadPickerOptions(user);
  return (
    <>
      <PageHeader title="Add a company" description="Only record facts you know. Leave anything you are unsure of blank." />
      <section className="card p-6">
        <CompanyForm
          company={{ ownerId: user.id, isShared: true, importance: 2 }}
          owners={options.assignableOwners}
          allowNoOwner={user.role !== "REP"}
          action={createCompany}
          submitLabel="Add company"
        />
      </section>
    </>
  );
}
