"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { MERGE_FIELDS, renderTemplate, sampleMergeValues, unknownPlaceholders } from "@/lib/outreach/merge";
import { Notice } from "@/components/ui";
import { saveTemplate } from "./actions";

type Template = {
  id?: string;
  name: string;
  customerGroup: string | null;
  reason: string;
  subject: string;
  body: string;
  isMarketing: boolean;
  active: boolean;
};

const reasons = [
  ["EPC_RISK", "EPC risk"], ["NET_ZERO", "Net zero targets"], ["NEW_ESG_HIRE", "New ESG hire"],
  ["TENDER", "Tender"], ["ACQUISITION", "Acquisition"], ["GENERAL_INTRO", "General introduction"],
];

/** Editor for an email template, with merge fields and a live preview using sample details. */
export function TemplateEditor({ template, canEdit, footerPreview }: { template: Template; canEdit: boolean; footerPreview: string }) {
  const [state, action, pending] = useActionState(saveTemplate, null);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [isMarketing, setIsMarketing] = useState(template.isMarketing);
  const [focused, setFocused] = useState<"subject" | "body">("body");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => ({ subject: renderTemplate(subject, sampleMergeValues).text, body: renderTemplate(body, sampleMergeValues).text }), [subject, body]);
  const unknown = useMemo(() => [...new Set([...unknownPlaceholders(subject), ...unknownPlaceholders(body)])], [subject, body]);

  function insert(key: string) {
    const token = `{{${key}}}`;
    const el = focused === "subject" ? subjectRef.current : bodyRef.current;
    const value = focused === "subject" ? subject : body;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (focused === "subject") setSubject(next);
    else setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <form action={action} className="grid gap-8 xl:grid-cols-[1fr_1fr]">
      {template.id ? <input type="hidden" name="id" value={template.id} /> : null}
      <fieldset disabled={!canEdit} className="grid content-start gap-5">
        <div>
          <label htmlFor="t-name" className="label">Template name</label>
          <input id="t-name" name="name" defaultValue={template.name} required maxLength={120} className="field" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="t-group" className="label">Customer group</label>
            <select id="t-group" name="customerGroup" defaultValue={template.customerGroup ?? ""} className="field">
              <option value="">Any group</option>
              <option value="ASSET_ESG">Asset and ESG</option>
              <option value="PROPERTY_MANAGER">Property manager</option>
              <option value="OCCUPIER">Occupier</option>
            </select>
          </div>
          <div>
            <label htmlFor="t-reason" className="label">Reason for getting in touch</label>
            <select id="t-reason" name="reason" defaultValue={template.reason} className="field">
              {reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="t-subject" className="label">Subject line</label>
          <input id="t-subject" ref={subjectRef} name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => setFocused("subject")} required maxLength={200} className="field" />
        </div>
        <div>
          <label htmlFor="t-body" className="label">Email</label>
          <textarea id="t-body" ref={bodyRef} name="body" value={body} onChange={(e) => setBody(e.target.value)} onFocus={() => setFocused("body")} rows={16} required maxLength={5000} className="field font-[inherit] leading-relaxed" />
        </div>
        {canEdit ? (
          <div>
            <p className="label">Insert a merge field</p>
            <p className="mb-2 text-xs text-ink-muted">Adds it where your cursor is, in the {focused === "subject" ? "subject line" : "email"}.</p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((f) => (
                <button key={f.key} type="button" onClick={() => insert(f.key)} className="rounded-full border border-stone bg-surface px-2.5 py-1 text-xs hover:border-ink" title={`{{${f.key}}}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="isMarketing" checked={isMarketing} onChange={(e) => setIsMarketing(e.target.checked)} className="mt-0.5 size-4 accent-green" />
          <span>
            Marketing email
            <span className="block text-xs text-ink-muted">Marketing emails always end with who we are, a privacy line and an unsubscribe link, and are blocked for anyone who does not meet the marketing rules. Untick only for replies to someone who contacted us first.</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={template.active} className="size-4 accent-green" />
          In use (untick to hide it from the template picker)
        </label>
        {unknown.length ? <Notice tone="red">These merge fields do not exist: {unknown.map((u) => `{{${u}}}`).join(", ")}</Notice> : null}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={pending || unknown.length > 0}>{pending ? "Saving" : template.id ? "Save template" : "Create template"}</button>
            <Link href="/outreach" className="text-sm">Back to the library</Link>
          </div>
        ) : null}
        {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
      </fieldset>

      <section aria-labelledby="preview-heading" className="xl:sticky xl:top-8 xl:self-start">
        <h2 id="preview-heading" className="text-sm font-semibold">Preview with sample details</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-stone bg-surface">
          <div className="border-b border-stone px-5 py-3 text-sm">
            <span className="text-ink-muted">Subject: </span>
            <span className="font-medium">{preview.subject}</span>
          </div>
          <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed">{preview.body}</div>
          {isMarketing ? (
            <div className="whitespace-pre-wrap border-t border-dashed border-stone bg-surface-sunk px-5 py-4 text-xs leading-relaxed text-ink-muted">
              <p className="mb-2 font-semibold text-ink">Added to every marketing email, and cannot be removed:</p>
              {footerPreview}
            </div>
          ) : null}
        </div>
      </section>
    </form>
  );
}
