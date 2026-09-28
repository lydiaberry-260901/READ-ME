"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { createDeal } from "../actions";

export function NewDealForm({ companies, owners, defaultCompanyId, me }: { companies: { id: string; name: string }[]; owners: { id: string; name: string }[]; defaultCompanyId: string; me: string }) {
  const [state, action, pending] = useActionState(createDeal, null);
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="n-name" className="label">Deal name</label>
        <input id="n-name" name="name" required maxLength={200} placeholder="For example: Harbourline portfolio energy platform" className="field" />
      </div>
      <div>
        <label htmlFor="n-company" className="label">Company</label>
        <select id="n-company" name="companyId" defaultValue={defaultCompanyId} required className="field">
          <option value="" disabled>Choose a company</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="n-value" className="label">Value (£)</label>
        <input id="n-value" name="value" type="number" min={0} step={1} defaultValue={0} required className="field" />
      </div>
      <div>
        <label htmlFor="n-close" className="label">Expected close date</label>
        <input id="n-close" name="expectedCloseDate" type="date" className="field" />
      </div>
      <div>
        <label htmlFor="n-group" className="label">Customer group</label>
        <select id="n-group" name="customerGroup" defaultValue="" className="field">
          <option value="">Same as the company</option>
          <option value="ASSET_ESG">Asset and ESG</option>
          <option value="PROPERTY_MANAGER">Property manager</option>
          <option value="OCCUPIER">Occupier</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="n-next" className="label">Next step</label>
        <input id="n-next" name="nextStep" maxLength={300} className="field" />
      </div>
      <div>
        <label htmlFor="n-owner" className="label">Owner</label>
        <select id="n-owner" name="ownerId" defaultValue={me} className="field">
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="isShared" className="size-4 accent-green" />
        Share with everyone
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating" : "Create deal"}</button>
      </div>
      {state ? <div className="sm:col-span-2"><Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice></div> : null}
    </form>
  );
}
