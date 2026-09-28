"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { saveOrganisation } from "./actions";

type Org = { name: string; legalName: string | null; postalAddress: string | null; websiteUrl: string | null; privacyNoticeUrl: string | null; phoneCheckMaxAgeDays: number; dailyTaskLimit: number; singleThreadedDays: number };

export function OrganisationForm({ org }: { org: Org }) {
  const [state, action, pending] = useActionState(saveOrganisation, null);
  return (
    <form action={action} className="grid max-w-2xl gap-5">
      <div>
        <label htmlFor="org-name" className="label">Name used in the CRM</label>
        <input id="org-name" name="name" defaultValue={org.name} required className="field" />
      </div>
      <div>
        <label htmlFor="org-legal" className="label">Legal name, as registered at Companies House</label>
        <input id="org-legal" name="legalName" defaultValue={org.legalName ?? ""} className="field" />
      </div>
      <div>
        <label htmlFor="org-address" className="label">Postal address</label>
        <input id="org-address" name="postalAddress" defaultValue={org.postalAddress ?? ""} className="field" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="org-web" className="label">Website</label>
          <input id="org-web" name="websiteUrl" type="url" defaultValue={org.websiteUrl ?? ""} placeholder="https://moca.energy" className="field" />
        </div>
        <div>
          <label htmlFor="org-privacy" className="label">Link to the full privacy notice</label>
          <input id="org-privacy" name="privacyNoticeUrl" type="url" defaultValue={org.privacyNoticeUrl ?? ""} placeholder="https://moca.energy/privacy" className="field" />
        </div>
      </div>
      <div className="max-w-xs">
        <label htmlFor="org-tps" className="label">Days before a TPS and CTPS check must be repeated</label>
        <input id="org-tps" name="phoneCheckMaxAgeDays" type="number" min={1} max={28} defaultValue={org.phoneCheckMaxAgeDays} className="field" />
        <p className="mt-1 text-xs text-fg-muted">At most 28 days, as the do not call lists change regularly.</p>
      </div>
      <fieldset className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Daily task list</legend>
        <div>
          <label htmlFor="org-limit" className="label">Most suggested tasks per person each day</label>
          <input id="org-limit" name="dailyTaskLimit" type="number" min={1} max={100} defaultValue={org.dailyTaskLimit} className="field" />
        </div>
        <div>
          <label htmlFor="org-single" className="label">Days with one engaged contact before a deal is single threaded</label>
          <input id="org-single" name="singleThreadedDays" type="number" min={1} max={90} defaultValue={org.singleThreadedDays} className="field" />
        </div>
        <p className="text-xs text-fg-muted sm:col-span-2">How long a deal can go without activity is set for each stage, under Deal stages.</p>
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save"}</button>
      </div>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}
