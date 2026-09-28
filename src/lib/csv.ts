// CSV downloads. Protects against spreadsheet formula tricks, and streams rows in batches so
// large lists do not have to fit in memory.

type Cell = string | number | boolean | Date | null | undefined;

/**
 * A cell starting with =, +, -, @, a tab or a carriage return can be run as a formula when the
 * file is opened in a spreadsheet. Such cells get a leading apostrophe so they stay as text.
 */
export function safeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvLine(cells: Cell[]): string {
  return `${cells.map(safeCell).join(",")}\r\n`;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  // A byte order mark helps Excel open the file as UTF-8, so £ signs appear correctly.
  return "﻿" + csvLine(header) + rows.map(csvLine).join("");
}

/** Streams a CSV built from pages of rows. `nextPage` returns an empty array when finished. */
export function csvStream(header: string[], nextPage: (page: number) => Promise<Cell[][]>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let page = 0;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("﻿" + csvLine(header)));
    },
    async pull(controller) {
      const rows = await nextPage(page++);
      if (rows.length === 0) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(rows.map(csvLine).join("")));
    },
  });
}

export function csvResponse(body: string | ReadableStream<Uint8Array>, fileName: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName.replace(/[^a-z0-9._-]/gi, "-")}"`,
      "cache-control": "no-store",
    },
  });
}

/** Today's date for file names, as yyyy-mm-dd in London. */
export function fileDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
