import { requireUser } from "@/lib/session";
import { loadPickerOptions } from "@/lib/options";
import { londonTodayIso } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "Import a CSV file" };

export default async function ImportPage() {
  const user = await requireUser();
  const options = await loadPickerOptions(user);
  return (
    <>
      <PageHeader
        title="Import a CSV file"
        description="Bring in companies and contacts from a spreadsheet. We check every row, spot duplicates by website and email, and never import anyone who has opted out."
      />
      <ImportWizard me={user.id} owners={options.assignableOwners} todayIso={londonTodayIso()} />
    </>
  );
}
