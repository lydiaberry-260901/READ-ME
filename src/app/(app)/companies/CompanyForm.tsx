"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "@/components/ui";

type Company = {
  id?: string;
  name?: string;
  website?: string | null;
  customerGroup?: string | null;
  importance?: number;
  description?: string | null;
  portfolioSize?: string | null;
  headOffice?: string | null;
  companiesHouseNumber?: string | null;
  alternativeNames?: string[];
  ownerId?: string | null;
  isShared?: boolean;
};

export function CompanyForm({
  company,
  owners,
  action,
  submitLabel,
  allowNoOwner,
}: {
  company?: Company;
  owners: { id: string; name: string }[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  allowNoOwner: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const c = company ?? {};

  return (
    <form action={formAction} className="grid gap-5 sm:grid-cols-2">
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="sm:col-span-2">
        <label htmlFor="c-name" className="label">Company name</label>
        <input id="c-name" name="name" required maxLength={200} defaultValue={c.name ?? ""} className="field" />
      </div>
      <div>
        <label htmlFor="c-website" className="label">Website</label>
        <input id="c-website" name="website" defaultValue={c.website ?? ""} placeholder="www.example.co.uk" className="field" />
        <p className="mt-1 text-xs text-mocha-muted">Used to spot duplicates and to fetch public details.</p>
      </div>
      <div>
        <label htmlFor="c-ch" className="label">Companies House number</label>
        <input id="c-ch" name="companiesHouseNumber" defaultValue={c.companiesHouseNumber ?? ""} placeholder="For example 01234567" className="field" />
      </div>
      <div>
        <label htmlFor="c-group" className="label">Customer group</label>
        <select id="c-group" name="customerGroup" defaultValue={c.customerGroup ?? ""} className="field">
          <option value="">Not set</option>
          <option value="ASSET_ESG">Asset and ESG</option>
          <option value="PROPERTY_MANAGER">Property manager</option>
          <option value="OCCUPIER">Occupier</option>
        </select>
      </div>
      <div>
        <label htmlFor="c-importance" className="label">Importance</label>
        <select id="c-importance" name="importance" defaultValue={String(c.importance ?? 2)} className="field">
          <option value="1">1, most important (news checked daily)</option>
          <option value="2">2</option>
          <option value="3">3, least important</option>
        </select>
      </div>
      <div>
        <label htmlFor="c-portfolio" className="label">Portfolio size</label>
        <input id="c-portfolio" name="portfolioSize" defaultValue={c.portfolioSize ?? ""} placeholder="For example 14 buildings, 1.9m sq ft" className="field" />
      </div>
      <div>
        <label htmlFor="c-office" className="label">Head office</label>
        <input id="c-office" name="headOffice" defaultValue={c.headOffice ?? ""} className="field" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="c-description" className="label">Description</label>
        <textarea id="c-description" name="description" rows={3} defaultValue={c.description ?? ""} className="field" />
        <p className="mt-1 text-xs text-mocha-muted">Facts about the company only. Do not record personal opinions about people.</p>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="c-alt" className="label">Other names the company is known by</label>
        <input id="c-alt" name="alternativeNames" defaultValue={(c.alternativeNames ?? []).join(", ")} placeholder="Separate names with commas" className="field" />
        <p className="mt-1 text-xs text-mocha-muted">Used when searching for news.</p>
      </div>
      <div>
        <label htmlFor="c-owner" className="label">Owner</label>
        <select id="c-owner" name="ownerId" defaultValue={c.ownerId ?? ""} className="field">
          {allowNoOwner ? <option value="">No owner</option> : null}
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <div className="flex items-end">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="isShared" defaultChecked={c.isShared ?? true} className="size-4 accent-green" />
          Shared with everyone (untick to keep it to the owner and their manager)
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : submitLabel}</button>
        {state ? (
          <div className="flex-1">
            <Notice tone={state.ok ? "green" : "red"}>
              {state.message} {state.link ? <Link href={state.link}>Open it</Link> : null}
            </Notice>
          </div>
        ) : null}
      </div>
    </form>
  );
}
