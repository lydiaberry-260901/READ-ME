"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import { IMPORT_FIELDS, guessMapping, type ColumnMapping, type ImportFieldKey } from "@/lib/import/fields";
import { Notice, StatCard } from "@/components/ui";
import { checkImport, startImport, type ImportPayload } from "./actions";

type Line = { row: number; company: string; contact: string; notes: string[] };
const MAX_ROWS = 5000;

function Step({ n, title, active, children }: { n: number; title: string; active: boolean; children: React.ReactNode }) {
  return (
    <section className={`card p-6 ${active ? "" : "opacity-60"}`} aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-lg font-semibold">
        <span className="grid size-7 place-items-center rounded-full bg-ink text-sm text-cream">{n}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function reportCsv(lines: Line[]) {
  return Papa.unparse(lines.map((l) => ({ Row: l.row, Company: l.company, Contact: l.contact, Notes: l.notes.join(" ") })));
}

export function ImportWizard({ me, owners, todayIso }: { me: string; owners: { id: string; name: string }[]; todayIso: string }) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileError, setFileError] = useState("");
  const [settings, setSettings] = useState({
    source: "",
    collectedAt: todayIso,
    lawfulBasis: "LEGITIMATE_INTERESTS" as const,
    defaultEntityType: "LIMITED_COMPANY" as const,
    defaultCustomerGroup: "" as "" | "ASSET_ESG" | "PROPERTY_MANAGER" | "OCCUPIER",
    ownerId: me,
    isShared: true,
    duplicateContacts: "skip" as "skip" | "update",
  });
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof checkImport>> | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof startImport>> | null>(null);
  const [pending, startTransition] = useTransition();

  const payload: ImportPayload = useMemo(
    () => ({ fileName, rows, mapping: mapping as Record<string, string>, settings }),
    [fileName, rows, mapping, settings],
  );

  function onFile(file: File | undefined) {
    setPreview(null);
    setResult(null);
    setFileError("");
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const fields = (res.meta.fields ?? []).filter(Boolean);
        if (fields.length === 0) {
          setFileError("We could not find any column headings in the first row of the file.");
          return;
        }
        if (res.data.length > MAX_ROWS) {
          setFileError(`The file has ${res.data.length} rows. Please split it into files of at most ${MAX_ROWS} rows.`);
          return;
        }
        setFileName(file.name);
        setHeaders(fields);
        setRows(res.data.map((r) => Object.fromEntries(fields.map((f) => [f, String(r[f] ?? "")]))));
        setMapping(guessMapping(fields));
      },
      error: () => setFileError("The file could not be read. Please check it is a CSV file."),
    });
  }

  const hasCompanyOrContact = Boolean(mapping.companyName || mapping.firstName || mapping.fullName || mapping.email);
  const ready = rows.length > 0 && hasCompanyOrContact && settings.source.trim().length >= 2;

  function runCheck() {
    setResult(null);
    startTransition(async () => setPreview(await checkImport(payload)));
  }
  function runImportNow() {
    startTransition(async () => setResult(await startImport(payload)));
  }
  function update<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setPreview(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <Step n={1} title="Choose a CSV file" active>
        <label htmlFor="csv-file" className="label">CSV file (the first row must hold the column headings)</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="block text-sm file:mr-3 file:rounded-md file:border file:border-stone-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium" />
        <p className="mt-2 text-sm text-ink-muted">
          Each row can hold a company, a contact, or both. <a href="/samples/moca-import-sample.csv" download>Download a sample file</a> to see the layout.
        </p>
        {fileError ? <div className="mt-3"><Notice tone="red">{fileError}</Notice></div> : null}
        {rows.length > 0 ? <p className="mt-3 text-sm font-medium">{fileName}: {rows.length} rows and {headers.length} columns found.</p> : null}
      </Step>

      <Step n={2} title="Match the columns" active={rows.length > 0}>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">Choose a file first.</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-muted">We have guessed where we can. Leave a field as "Not in this file" if the file does not have it. Only business details can be imported.</p>
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              {(["Company", "Contact"] as const).map((group) => (
                <div key={group}>
                  <h3 className="mb-2 text-sm font-semibold">{group}</h3>
                  <div className="space-y-2">
                    {IMPORT_FIELDS.filter((f) => f.group === group).map((f) => (
                      <div key={f.key} className="grid grid-cols-[1fr_1fr] items-center gap-3">
                        <label htmlFor={`map-${f.key}`} className="text-sm">{f.label}</label>
                        <select
                          id={`map-${f.key}`}
                          value={mapping[f.key] ?? ""}
                          onChange={(e) => {
                            setMapping((m) => ({ ...m, [f.key as ImportFieldKey]: e.target.value || undefined }));
                            setPreview(null);
                          }}
                          className="field py-1.5"
                        >
                          <option value="">Not in this file</option>
                          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {!hasCompanyOrContact ? <div className="mt-4"><Notice tone="amber">Match at least a company name, a contact name or an email column.</Notice></div> : null}
          </>
        )}
      </Step>

      <Step n={3} title="Where the data came from" active={rows.length > 0}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="imp-source" className="label">Source (required by data protection law)</label>
            <input id="imp-source" value={settings.source} onChange={(e) => update("source", e.target.value)} maxLength={200} placeholder="For example: MIPIM 2026 attendee list, company websites, purchased from a named data supplier" className="field" />
          </div>
          <div>
            <label htmlFor="imp-date" className="label">Date collected</label>
            <input id="imp-date" type="date" value={settings.collectedAt} max={todayIso} onChange={(e) => update("collectedAt", e.target.value)} className="field" />
          </div>
          <div>
            <label htmlFor="imp-basis" className="label">Lawful reason</label>
            <select id="imp-basis" value={settings.lawfulBasis} onChange={(e) => update("lawfulBasis", e.target.value as typeof settings.lawfulBasis)} className="field">
              <option value="LEGITIMATE_INTERESTS">Legitimate interests (normal for business to business prospecting)</option>
              <option value="CONSENT">Consent</option>
              <option value="CONTRACT">Contract (existing customers)</option>
            </select>
          </div>
          <div>
            <label htmlFor="imp-entity" className="label">Business type, where the file does not say</label>
            <select id="imp-entity" value={settings.defaultEntityType} onChange={(e) => update("defaultEntityType", e.target.value as typeof settings.defaultEntityType)} className="field">
              <option value="LIMITED_COMPANY">Limited company</option>
              <option value="PUBLIC_BODY">Public body</option>
              <option value="LLP">Limited liability partnership</option>
              <option value="UNKNOWN">Not known yet</option>
            </select>
          </div>
          <div>
            <label htmlFor="imp-group" className="label">Customer group, where the file does not say</label>
            <select id="imp-group" value={settings.defaultCustomerGroup} onChange={(e) => update("defaultCustomerGroup", e.target.value as typeof settings.defaultCustomerGroup)} className="field">
              <option value="">Leave blank</option>
              <option value="ASSET_ESG">Asset and ESG</option>
              <option value="PROPERTY_MANAGER">Property manager</option>
              <option value="OCCUPIER">Occupier</option>
            </select>
          </div>
          <div>
            <label htmlFor="imp-owner" className="label">Owner of new records</label>
            <select id="imp-owner" value={settings.ownerId} onChange={(e) => update("ownerId", e.target.value)} className="field">
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="imp-dups" className="label">When a contact's email is already in the CRM</label>
            <select id="imp-dups" value={settings.duplicateContacts} onChange={(e) => update("duplicateContacts", e.target.value as "skip" | "update")} className="field">
              <option value="skip">Skip that row's contact</option>
              <option value="update">Fill in any empty fields on the existing contact</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={settings.isShared} onChange={(e) => update("isShared", e.target.checked)} className="size-4 accent-green" />
            Share new records with everyone
          </label>
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          People whose details come from somewhere other than themselves must be told about it within one month. The first email to each of them includes the privacy notice.
        </p>
      </Step>

      <Step n={4} title="Check, then import" active={ready}>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" disabled={!ready || pending} onClick={runCheck}>
            {pending && !preview ? "Checking" : "Check the file"}
          </button>
          <button type="button" className="btn btn-primary" disabled={!ready || pending || !preview?.ok || Boolean(result?.ok)} onClick={runImportNow}>
            {pending && preview ? "Importing" : "Import now"}
          </button>
        </div>
        {!ready && rows.length > 0 ? <p className="mt-3 text-sm text-ink-muted">Fill in the source in step 3 to continue.</p> : null}

        {preview && !preview.ok ? <div className="mt-4"><Notice tone="red">{preview.message}</Notice></div> : null}
        {preview?.ok && !result ? (
          <div className="mt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="New companies" value={preview.summary.companiesToCreate} />
              <StatCard label="Companies already in the CRM" value={preview.summary.companiesExisting} />
              <StatCard label="New contacts" value={preview.summary.contactsToCreate + preview.summary.contactsToUpdate} hint={preview.summary.contactsToUpdate ? `${preview.summary.contactsToUpdate} of them existing, to be filled in` : undefined} />
              <StatCard label="Contacts to skip" value={preview.summary.contactsSkipped} hint="Duplicates, opt outs or problems" />
            </div>
            <LinesTable lines={preview.lines.filter((l) => l.notes.length > 0)} title="Rows to look at" empty="No problems found." />
          </div>
        ) : null}

        {result && !result.ok ? <div className="mt-4"><Notice tone="red">{result.message}</Notice></div> : null}
        {result?.ok ? (
          <div className="mt-6">
            <Notice tone="green" title="Import finished">
              {result.counts.companiesCreated} companies created, {result.counts.companiesMatched} matched to existing companies,{" "}
              {result.counts.contactsCreated} contacts created, {result.counts.contactsUpdated} existing contacts filled in,{" "}
              {result.counts.skipped} skipped and {result.counts.failed} failed.
            </Notice>
            <button
              type="button"
              className="btn btn-secondary mt-4"
              onClick={() => {
                const blob = new Blob([reportCsv(result.report)], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `import-report-${todayIso}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download the full report
            </button>
            <LinesTable lines={result.report.filter((l) => l.notes.length > 0)} title="Rows with notes" empty="Every row imported cleanly." />
          </div>
        ) : null}
      </Step>
    </div>
  );
}

function LinesTable({ lines, title, empty }: { lines: Line[]; title: string; empty: string }) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{empty}</p>
      ) : (
        <div className="mt-2 max-h-96 overflow-auto rounded-md border border-stone">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-sunk text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Row</th>
                <th scope="col" className="px-3 py-2 font-medium">Company</th>
                <th scope="col" className="px-3 py-2 font-medium">Contact</th>
                <th scope="col" className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone">
              {lines.slice(0, 200).map((l) => (
                <tr key={l.row} className="align-top">
                  <td className="px-3 py-2 tabular-nums">{l.row}</td>
                  <td className="px-3 py-2">{l.company || "None"}</td>
                  <td className="px-3 py-2">{l.contact || "None"}</td>
                  <td className="px-3 py-2">{l.notes.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines.length > 200 ? <p className="p-3 text-sm text-ink-muted">Showing the first 200. Download the report for all of them.</p> : null}
        </div>
      )}
    </div>
  );
}
