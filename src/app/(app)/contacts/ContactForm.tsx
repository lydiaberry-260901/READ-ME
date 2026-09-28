"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "@/components/ui";

type Contact = {
  id?: string;
  firstName?: string;
  lastName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  companyId?: string | null;
  ownerId?: string | null;
  isShared?: boolean;
  notes?: string | null;
  entityType?: string;
};

export const NOTES_WARNING =
  "Only record business information here. Do not record personal opinions or sensitive details such as health, politics, religion, or anything about family.";

export function ContactForm({
  contact,
  isNew,
  companies,
  owners,
  allowNoOwner,
  action,
  todayIso,
}: {
  contact: Contact;
  isNew: boolean;
  companies: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  allowNoOwner: boolean;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  todayIso: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const c = contact;

  return (
    <form action={formAction} className="grid gap-5 sm:grid-cols-2">
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
      <p className="text-sm text-fg-muted sm:col-span-2">
        Collect business details only: name, job title, work email, work phone, company and a public professional profile link.
      </p>
      <div>
        <label htmlFor="p-first" className="label">First name</label>
        <input id="p-first" name="firstName" required maxLength={100} defaultValue={c.firstName ?? ""} className="field" />
      </div>
      <div>
        <label htmlFor="p-last" className="label">Last name</label>
        <input id="p-last" name="lastName" maxLength={100} defaultValue={c.lastName ?? ""} className="field" />
      </div>
      <div>
        <label htmlFor="p-title" className="label">Job title</label>
        <input id="p-title" name="jobTitle" maxLength={150} defaultValue={c.jobTitle ?? ""} className="field" />
      </div>
      <div>
        <label htmlFor="p-company" className="label">Company</label>
        <select id="p-company" name="companyId" defaultValue={c.companyId ?? ""} className="field">
          <option value="">No company</option>
          {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="p-email" className="label">Work email</label>
        <input id="p-email" name="email" type="email" maxLength={200} defaultValue={c.email ?? ""} className="field" />
      </div>
      <div>
        <label htmlFor="p-phone" className="label">Work phone</label>
        <input id="p-phone" name="phone" type="tel" maxLength={40} defaultValue={c.phone ?? ""} className="field" />
        {!isNew ? <p className="mt-1 text-xs text-fg-muted">Changing the number means it must be checked against the do not call lists again.</p> : null}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="p-link" className="label">Public professional profile link</label>
        <input id="p-link" name="linkedinUrl" type="url" maxLength={300} placeholder="https://www.linkedin.com/in/..." defaultValue={c.linkedinUrl ?? ""} className="field" />
      </div>
      <div>
        <label htmlFor="p-entity" className="label">What kind of business do they work for?</label>
        <select id="p-entity" name="entityType" defaultValue={c.entityType ?? "UNKNOWN"} className="field">
          <option value="LIMITED_COMPANY">Limited company</option>
          <option value="PUBLIC_BODY">Public body</option>
          <option value="LLP">Limited liability partnership (LLP)</option>
          <option value="SOLE_TRADER">Sole trader</option>
          <option value="PARTNERSHIP">Other partnership</option>
          <option value="UNKNOWN">Not known yet</option>
        </select>
        <p className="mt-1 text-xs text-fg-muted">Sole traders and other partnerships are treated as individuals, so marketing emails need their consent.</p>
      </div>
      <div>
        <label htmlFor="p-owner" className="label">Owner</label>
        <select id="p-owner" name="ownerId" defaultValue={c.ownerId ?? ""} className="field">
          {allowNoOwner ? <option value="">No owner</option> : null}
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      {isNew ? (
        <fieldset className="grid gap-5 rounded-md border border-line bg-panel-sunk p-4 sm:col-span-2 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">Where these details came from (required by data protection law)</legend>
          <div className="sm:col-span-3">
            <label htmlFor="p-source" className="label">Source</label>
            <input id="p-source" name="source" required minLength={2} maxLength={200} placeholder="For example: company website, event, introduction from a colleague" className="field" />
          </div>
          <div>
            <label htmlFor="p-collected" className="label">Date collected</label>
            <input id="p-collected" name="collectedAt" type="date" required defaultValue={todayIso} max={todayIso} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="p-basis" className="label">Lawful reason for holding their details</label>
            <select id="p-basis" name="lawfulBasis" defaultValue="LEGITIMATE_INTERESTS" className="field">
              <option value="LEGITIMATE_INTERESTS">Legitimate interests (normal for business to business prospecting)</option>
              <option value="CONSENT">Consent</option>
              <option value="CONTRACT">Contract (an existing customer)</option>
            </select>
          </div>
        </fieldset>
      ) : null}

      <div className="sm:col-span-2">
        <label htmlFor="p-notes" className="label">Notes</label>
        <p id="p-notes-warning" className="mb-2 rounded-md border border-amber/50 bg-amber-tint px-3 py-2 text-sm text-amber-text">
          <strong>Please note:</strong> {NOTES_WARNING}
        </p>
        <textarea id="p-notes" name="notes" rows={4} maxLength={4000} defaultValue={c.notes ?? ""} aria-describedby="p-notes-warning" className="field" />
      </div>
      <div className="sm:col-span-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="isShared" defaultChecked={c.isShared ?? true} className="size-4 accent-green" />
          Shared with everyone (untick to keep it to the owner and their manager)
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : isNew ? "Add contact" : "Save details"}</button>
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
