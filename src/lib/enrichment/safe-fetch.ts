// Careful fetching of outside web pages.
// Only http and https, never addresses inside our own network, time and size limits,
// and a clear name so site owners can see who is visiting.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const USER_AGENT = "MocaCRM/1.0 (+https://moca.energy; company details lookup)";

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

/** True for loopback, private, link local and other addresses that must never be fetched. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")) return true;
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return false;
}

async function assertPublicHost(hostname: string) {
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new FetchBlockedError("That address is not a public website.");
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new FetchBlockedError("That address is not a public website.");
  }
}

export type SafeFetchResult = { url: string; status: number; contentType: string; body: string };

export async function safeFetch(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; accept?: string } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = 8000, maxBytes = 1_000_000, maxRedirects = 3, accept = "text/html,text/plain" } = opts;
  let url = new URL(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Only web addresses are allowed.");
    await assertPublicHost(url.hostname);

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": USER_AGENT, accept },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = new URL(response.headers.get("location")!, url);
      continue;
    }

    // Read at most maxBytes, so a huge page cannot slow things down.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { url: url.toString(), status: response.status, contentType: response.headers.get("content-type") ?? "", body };
  }
  throw new FetchBlockedError("The website redirected too many times.");
}
