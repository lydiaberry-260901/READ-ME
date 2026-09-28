// Turns an uploaded file into plain text. Only the text is kept, never the original file.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;

export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".csv", ".vtt", ".srt", ".docx", ".pdf"] as const;

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/** Removes the timing lines and numbering from subtitle files (.vtt and .srt), keeping what was said. */
export function subtitlesToText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t || t === "WEBVTT" || /^NOTE\b/.test(t)) return false;
      if (/^\d+$/.test(t)) return false;
      if (/-->/.test(t)) return false;
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .join("\n");
}

/** Tidies extracted text: consistent line endings, no runs of blank lines or spaces. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(fileName: string, bytes: Uint8Array): Promise<string> {
  const ext = extensionOf(fileName);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ExtractError(`${fileName}: this type of file cannot be read. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ExtractError(`${fileName}: the file is larger than 10 MB.`);

  let text: string;
  try {
    if (ext === ".pdf") {
      const { extractText: pdfText } = await import("unpdf");
      text = (await pdfText(bytes, { mergePages: true })).text;
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else {
      const raw = new TextDecoder("utf-8").decode(bytes);
      text = ext === ".vtt" || ext === ".srt" ? subtitlesToText(raw) : raw;
    }
  } catch {
    throw new ExtractError(`${fileName}: the file could not be read. It may be damaged or password protected.`);
  }

  text = tidyText(text);
  if (text.length < 20) {
    throw new ExtractError(`${fileName}: no readable text was found. Scanned documents need to be converted to text first.`);
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw new ExtractError(`${fileName}: the text is too long (over ${MAX_TEXT_CHARS.toLocaleString("en-GB")} characters). Please split it into smaller documents.`);
  }
  return text;
}

export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled document";
}
