import { requireCapability } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { BattlecardForm } from "../BattlecardForm";

export const metadata = { title: "New battlecard" };

export default async function NewBattlecardPage() {
  await requireCapability("battlecards.edit");
  return (
    <>
      <PageHeader title="New battlecard" />
      <BattlecardForm card={{ competitorName: "", comparison: "", objections: [] }} />
    </>
  );
}
