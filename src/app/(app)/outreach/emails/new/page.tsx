import { requireCapability } from "@/lib/session";
import { footerPreviewFor } from "@/lib/outreach/footer-preview";
import { PageHeader } from "@/components/ui";
import { TemplateEditor } from "../../TemplateEditor";

export const metadata = { title: "New email template" };

export default async function NewTemplatePage() {
  const user = await requireCapability("templates.manage");
  return (
    <>
      <PageHeader title="New email template" description="Keep it short, specific and honest. Only use figures you can back up." />
      <TemplateEditor
        canEdit
        footerPreview={await footerPreviewFor(user.organisationId)}
        template={{ name: "", customerGroup: null, reason: "GENERAL_INTRO", subject: "", body: "Hello {{contact.firstName}},\n\n\n\nBest wishes,\n{{sender.name}}\n{{sender.jobTitle}}, Moca", isMarketing: true, active: true }}
      />
    </>
  );
}
