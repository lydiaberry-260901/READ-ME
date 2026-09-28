"use client";

import { useActionState, useRef, useState } from "react";
import clsx from "clsx";
import type { ActionResult } from "@/lib/action-result";
import { Notice } from "@/components/ui";
import { addPastedText, uploadDocuments } from "./actions";

const ACCEPT = ".txt,.md,.csv,.vtt,.srt,.docx,.pdf";
const MAX_BYTES = 10 * 1024 * 1024;

const kinds = [
  { value: "COMPANY_CONTEXT", label: "Company context", hint: "Who Moca is, positioning, pitch decks, FAQs" },
  { value: "PRODUCT", label: "Product and services", hint: "Features, pricing notes, how it works" },
  { value: "CASE_STUDY", label: "Case study", hint: "Customer results and stories" },
  { value: "TRANSCRIPT", label: "Transcript", hint: "Good example calls, webinars, demos" },
  { value: "OTHER", label: "Other", hint: "Anything else useful" },
];

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Message({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return <div className="mt-4"><Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice></div>;
}

function KindAndPrivacy({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefix}-kind`} className="label">What kind of document is it?</label>
        <select id={`${idPrefix}-kind`} name="kind" defaultValue="COMPANY_CONTEXT" className="field">
          {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}: {k.hint}</option>)}
        </select>
      </div>
      <label className="flex items-start gap-2 self-end text-sm">
        <input type="checkbox" name="containsPersonalData" className="mt-0.5 size-4 accent-green" />
        <span>
          It still contains personal details about people (names, contact details, opinions).
          <span className="block text-xs text-fg-muted">If ticked, it is stored for reference but never sent to the AI.</span>
        </span>
      </label>
    </div>
  );
}

export function UploadPanel() {
  const [tab, setTab] = useState<"files" | "paste">("files");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, uploadAction, uploading] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    formData.delete("files");
    for (const f of files) formData.append("files", f);
    const result = await uploadDocuments(prev, formData);
    if (result.ok) setFiles([]);
    return result;
  }, null);
  const [pasteState, pasteAction, pasting] = useActionState(addPastedText, null);

  const total = files.reduce((s, f) => s + f.size, 0);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((current) => {
      const names = new Set(current.map((f) => f.name));
      return [...current, ...incoming.filter((f) => !names.has(f.name))];
    });
  }

  return (
    <section className="card p-6" aria-labelledby="add-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="add-heading" className="text-lg font-semibold">Add to the library</h2>
        <div role="tablist" aria-label="How to add" className="inline-flex rounded-md border border-line p-0.5 text-sm">
          {(["files", "paste"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={clsx("rounded px-3 py-1.5 font-medium", tab === t ? "bg-fg text-canvas" : "text-fg hover:bg-panel-sunk")}
            >
              {t === "files" ? "Upload files" : "Paste text"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 rounded-md border border-amber/50 bg-amber-tint px-3 py-2 text-sm text-amber-text">
        <strong>Before you upload:</strong> remove personal details you do not need, especially from transcripts and case studies.
        Only add material Moca is allowed to use. Email addresses and phone numbers are removed automatically before anything is sent to the AI.
      </p>

      {tab === "files" ? (
        <form action={uploadAction} className="mt-5 grid gap-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={clsx(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-green bg-green-tint" : "border-line-strong/60 bg-panel-sunk",
            )}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="stroke-fg-muted" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <p className="mt-3 font-medium">Drag and drop files here</p>
            <p className="mt-1 text-sm text-fg-muted">Word, PDF, text, Markdown, CSV or subtitle files (.vtt, .srt). Up to 10 MB at a time.</p>
            <button type="button" className="btn btn-secondary mt-4" onClick={() => inputRef.current?.click()}>
              Choose files
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="sr-only"
              aria-label="Choose files to upload"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 ? (
            <ul className="divide-y divide-line rounded-md border border-line text-sm">
              {files.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate">{f.name}</span>
                  <span className="flex items-center gap-3 text-fg-muted">
                    {formatSize(f.size)}
                    <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x !== f))} className="text-red-text hover:underline" aria-label={`Remove ${f.name}`}>
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {total > MAX_BYTES ? <Notice tone="red">These files add up to more than 10 MB. Please upload them in smaller groups.</Notice> : null}

          <KindAndPrivacy idPrefix="up" />
          <div>
            <button type="submit" className="btn btn-primary" disabled={uploading || files.length === 0 || total > MAX_BYTES}>
              {uploading ? "Reading the files" : `Add ${files.length || ""} ${files.length === 1 ? "file" : "files"}`.replace("  ", " ")}
            </button>
          </div>
          <Message state={uploadState} />
        </form>
      ) : (
        <form action={pasteAction} className="mt-5 grid gap-5">
          <div>
            <label htmlFor="paste-title" className="label">Title</label>
            <input id="paste-title" name="title" required maxLength={200} className="field" placeholder="For example: Octopus Real Estate case study" />
          </div>
          <div>
            <label htmlFor="paste-text" className="label">Text</label>
            <textarea id="paste-text" name="text" required rows={10} className="field" />
          </div>
          <KindAndPrivacy idPrefix="paste" />
          <div>
            <button type="submit" className="btn btn-primary" disabled={pasting}>{pasting ? "Saving" : "Add to the library"}</button>
          </div>
          <Message state={pasteState} />
        </form>
      )}
    </section>
  );
}
