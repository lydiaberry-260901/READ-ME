import { requireCapability } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ScriptEditor } from "../../ScriptEditor";
import { saveScript } from "../../actions";

export const metadata = { title: "New call script" };

export default async function NewScriptPage() {
  await requireCapability("templates.manage");
  return (
    <>
      <PageHeader title="New call script" description="An opening line, a few open questions, likely objections with honest replies, and one clear request." />
      <ScriptEditor
        canEdit
        action={saveScript}
        script={{
          name: "", customerGroup: null, reason: "GENERAL_INTRO", active: true,
          opening: "Hello {{contact.firstName}}, it is {{sender.name}} from Moca. ",
          questions: ["", "", ""], objections: [{ objection: "", response: "" }], ask: "",
        }}
      />
    </>
  );
}
