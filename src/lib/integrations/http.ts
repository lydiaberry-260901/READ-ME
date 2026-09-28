// Calls to Google and Microsoft, with errors sorted into what to do about them.
// Tests swap in a pretend fetch, so they never touch the real services.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (input, init) => fetch(input, init);

export function setFetchForTests(f: FetchLike | null) {
  fetchImpl = f ?? ((input, init) => fetch(input, init));
}

/**
 * auth: access has expired or been removed; the person must reconnect.
 * rate: the service asked us to slow down; try again later.
 * temporary: a fault on their side or the network; try again later.
 * permanent: something about the request itself is wrong; retrying will not help.
 */
export type ProviderErrorKind = "auth" | "rate" | "temporary" | "permanent";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function friendlyProviderMessage(e: ProviderError): string {
  switch (e.kind) {
    case "auth":
      return "Access has expired or been removed. Please reconnect this account.";
    case "rate":
      return "The service asked us to slow down. It will be tried again shortly.";
    case "temporary":
      return "The service could not be reached. It will be tried again shortly.";
    default:
      return `The service refused the request: ${e.message}`;
  }
}

export async function providerFetch(url: string, init: RequestInit & { accessToken?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.accessToken) headers.set("authorization", `Bearer ${init.accessToken}`);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new ProviderError("temporary", error instanceof Error ? error.message : "Network error");
  }
  if (response.ok) return response;

  const retryAfter = Number(response.headers.get("retry-after")) || undefined;
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // Ignore unreadable error bodies.
  }
  if (response.status === 401 || (response.status === 400 && /invalid_grant/.test(detail))) throw new ProviderError("auth", detail || "Unauthorised");
  if (response.status === 403 && /insufficient|scope|consent|revoked/i.test(detail)) throw new ProviderError("auth", detail);
  if (response.status === 429 || (response.status === 403 && /rate|quota|limit/i.test(detail))) throw new ProviderError("rate", detail || "Too many requests", retryAfter);
  if (response.status >= 500 || response.status === 408) throw new ProviderError("temporary", detail || `Error ${response.status}`, retryAfter);
  throw new ProviderError("permanent", detail || `Error ${response.status}`);
}
