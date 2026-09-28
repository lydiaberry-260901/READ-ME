// Google (Gmail and Google Calendar) and Microsoft (Outlook and Microsoft 365 calendar),
// turned into one common shape.
import { providerFetch } from "./http";
import { buildMime, type OutgoingEmail } from "./mime";
import type { ProviderId } from "./oauth";

export type NormalMessage = {
  providerMessageId: string;
  internetMessageId: string | null;
  threadId: string | null;
  from: string;
  to: string[];
  cc: string[];
  subject: string | null;
  snippet: string | null;
  sentAt: Date;
};

export type NormalEvent = {
  providerEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  cancelled: boolean;
  attendees: { email: string; name: string | null; response: string | null }[];
};

export type NewEvent = { title: string; description: string | null; location: string | null; startAt: Date; endAt: Date; attendees: string[]; sendInvites: boolean };

export interface MailAdapter {
  listSince(token: string, since: Date, max?: number): Promise<NormalMessage[]>;
  send(token: string, email: OutgoingEmail): Promise<{ providerMessageId: string | null; threadId: string | null }>;
}

export interface CalendarAdapter {
  list(token: string, from: Date, to: Date): Promise<NormalEvent[]>;
  create(token: string, event: NewEvent): Promise<NormalEvent>;
  cancel(token: string, providerEventId: string, notify: boolean): Promise<void>;
}

const addr = (s: string) => {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
};
const addrList = (s: string | undefined) => (s ? s.split(",").map(addr).filter((a) => a.includes("@")) : []);

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GCAL = "https://www.googleapis.com/calendar/v3/calendars/primary";

export const googleMail: MailAdapter = {
  async listSince(token, since, max = 300) {
    const ids: string[] = [];
    let pageToken: string | undefined;
    const q = `after:${Math.floor(since.getTime() / 1000)} -in:drafts -in:chats`;
    do {
      const url = `${GMAIL}/messages?${new URLSearchParams({ q, maxResults: "100", ...(pageToken ? { pageToken } : {}) })}`;
      const page = (await (await providerFetch(url, { accessToken: token })).json()) as { messages?: { id: string }[]; nextPageToken?: string };
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < max);

    const out: NormalMessage[] = [];
    for (const id of ids.slice(0, max)) {
      const params = new URLSearchParams({ format: "metadata" });
      for (const h of ["From", "To", "Cc", "Subject", "Message-ID"]) params.append("metadataHeaders", h);
      const m = (await (await providerFetch(`${GMAIL}/messages/${id}?${params}`, { accessToken: token })).json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        internalDate: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
      const h = (name: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value;
      out.push({
        providerMessageId: m.id,
        internetMessageId: h("Message-ID") ?? null,
        threadId: m.threadId,
        from: addr(h("From") ?? ""),
        to: addrList(h("To")),
        cc: addrList(h("Cc")),
        subject: h("Subject") ?? null,
        snippet: m.snippet ?? null,
        sentAt: new Date(Number(m.internalDate)),
      });
    }
    return out;
  },
  async send(token, email) {
    const res = await providerFetch(`${GMAIL}/messages/send`, {
      method: "POST",
      accessToken: token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(buildMime(email), "utf8").toString("base64url") }),
    });
    const json = (await res.json()) as { id?: string; threadId?: string };
    return { providerMessageId: json.id ?? null, threadId: json.threadId ?? null };
  },
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
};

function fromGoogleEvent(e: GoogleEvent): NormalEvent {
  const allDay = Boolean(e.start.date && !e.start.dateTime);
  return {
    providerEventId: e.id,
    title: e.summary ?? "Untitled event",
    description: e.description ?? null,
    location: e.location ?? null,
    meetingUrl: e.hangoutLink ?? null,
    startAt: new Date(e.start.dateTime ?? `${e.start.date}T00:00:00Z`),
    endAt: new Date(e.end.dateTime ?? `${e.end.date}T00:00:00Z`),
    allDay,
    cancelled: e.status === "cancelled",
    attendees: (e.attendees ?? []).map((a) => ({ email: a.email.toLowerCase(), name: a.displayName ?? null, response: a.responseStatus ?? null })),
  };
}

export const googleCalendar: CalendarAdapter = {
  async list(token, from, to) {
    const out: NormalEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", showDeleted: "true", maxResults: "250", ...(pageToken ? { pageToken } : {}) });
      const page = (await (await providerFetch(`${GCAL}/events?${params}`, { accessToken: token })).json()) as { items?: GoogleEvent[]; nextPageToken?: string };
      out.push(...(page.items ?? []).map(fromGoogleEvent));
      pageToken = page.nextPageToken;
    } while (pageToken && out.length < 2000);
    return out;
  },
  async create(token, ev) {
    const res = await providerFetch(`${GCAL}/events?sendUpdates=${ev.sendInvites ? "all" : "none"}`, {
      method: "POST",
      accessToken: token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        summary: ev.title,
        description: ev.description ?? undefined,
        location: ev.location ?? undefined,
        start: { dateTime: ev.startAt.toISOString(), timeZone: "Europe/London" },
        end: { dateTime: ev.endAt.toISOString(), timeZone: "Europe/London" },
        attendees: ev.attendees.map((email) => ({ email })),
      }),
    });
    return fromGoogleEvent((await res.json()) as GoogleEvent);
  },
  async cancel(token, id, notify) {
    await providerFetch(`${GCAL}/events/${encodeURIComponent(id)}?sendUpdates=${notify ? "all" : "none"}`, { method: "DELETE", accessToken: token });
  },
};

// ---------------------------------------------------------------------------
// Microsoft
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.microsoft.com/v1.0/me";
type GraphAddress = { emailAddress?: { address?: string; name?: string } };
const graphAddr = (a?: GraphAddress) => (a?.emailAddress?.address ?? "").toLowerCase();
const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

export const microsoftMail: MailAdapter = {
  async listSince(token, since, max = 300) {
    const out: NormalMessage[] = [];
    const select = "id,conversationId,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,isDraft";
    let url: string | undefined = `${GRAPH}/messages?${new URLSearchParams({ $filter: `receivedDateTime ge ${since.toISOString()}`, $orderby: "receivedDateTime desc", $select: select, $top: "50" })}`;
    while (url && out.length < max) {
      const page = (await (await providerFetch(url, { accessToken: token })).json()) as {
        value: { id: string; conversationId?: string; internetMessageId?: string; subject?: string; bodyPreview?: string; from?: GraphAddress; toRecipients?: GraphAddress[]; ccRecipients?: GraphAddress[]; sentDateTime?: string; receivedDateTime: string; isDraft?: boolean }[];
        "@odata.nextLink"?: string;
      };
      for (const m of page.value) {
        if (m.isDraft) continue;
        out.push({
          providerMessageId: m.id,
          internetMessageId: m.internetMessageId ?? null,
          threadId: m.conversationId ?? null,
          from: graphAddr(m.from),
          to: (m.toRecipients ?? []).map(graphAddr).filter(Boolean),
          cc: (m.ccRecipients ?? []).map(graphAddr).filter(Boolean),
          subject: m.subject ?? null,
          snippet: m.bodyPreview ?? null,
          sentAt: new Date(m.sentDateTime ?? m.receivedDateTime),
        });
      }
      url = page["@odata.nextLink"];
    }
    return out;
  },
  async send(token, email) {
    // Sent in the standard email format, so the unsubscribe headers are kept.
    await providerFetch(`${GRAPH}/sendMail`, {
      method: "POST",
      accessToken: token,
      headers: { "content-type": "text/plain" },
      body: Buffer.from(buildMime(email), "utf8").toString("base64"),
    });
    // Microsoft does not return an id; the email is matched by its Message-ID when it syncs back.
    return { providerMessageId: null, threadId: null };
  },
};

type GraphEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  start: { dateTime: string };
  end: { dateTime: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  attendees?: (GraphAddress & { status?: { response?: string } })[];
};

function fromGraphEvent(e: GraphEvent): NormalEvent {
  return {
    providerEventId: e.id,
    title: e.subject ?? "Untitled event",
    description: e.bodyPreview ?? null,
    location: e.location?.displayName || null,
    meetingUrl: e.onlineMeeting?.joinUrl ?? null,
    startAt: utc(e.start.dateTime),
    endAt: utc(e.end.dateTime),
    allDay: Boolean(e.isAllDay),
    cancelled: Boolean(e.isCancelled),
    attendees: (e.attendees ?? []).map((a) => ({ email: graphAddr(a), name: a.emailAddress?.name ?? null, response: a.status?.response ?? null })),
  };
}

export const microsoftCalendar: CalendarAdapter = {
  async list(token, from, to) {
    const out: NormalEvent[] = [];
    let url: string | undefined = `${GRAPH}/calendarView?${new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "100", $select: "id,subject,bodyPreview,location,onlineMeeting,start,end,isAllDay,isCancelled,attendees" })}`;
    while (url && out.length < 2000) {
      const page = (await (await providerFetch(url, { accessToken: token, headers: { prefer: 'outlook.timezone="UTC"' } })).json()) as { value: GraphEvent[]; "@odata.nextLink"?: string };
      out.push(...page.value.map(fromGraphEvent));
      url = page["@odata.nextLink"];
    }
    return out;
  },
  async create(token, ev) {
    const res = await providerFetch(`${GRAPH}/events`, {
      method: "POST",
      accessToken: token,
      headers: { "content-type": "application/json", prefer: 'outlook.timezone="UTC"' },
      body: JSON.stringify({
        subject: ev.title,
        body: { contentType: "Text", content: ev.description ?? "" },
        location: ev.location ? { displayName: ev.location } : undefined,
        start: { dateTime: ev.startAt.toISOString().replace("Z", ""), timeZone: "UTC" },
        end: { dateTime: ev.endAt.toISOString().replace("Z", ""), timeZone: "UTC" },
        // Outlook sends invitations to anyone listed, so attendees are only added when the person asks.
        attendees: ev.sendInvites ? ev.attendees.map((address) => ({ emailAddress: { address }, type: "required" })) : [],
      }),
    });
    return fromGraphEvent((await res.json()) as GraphEvent);
  },
  async cancel(token, id, notify) {
    if (notify) {
      await providerFetch(`${GRAPH}/events/${encodeURIComponent(id)}/cancel`, { method: "POST", accessToken: token, headers: { "content-type": "application/json" }, body: JSON.stringify({ comment: "" }) });
    } else {
      await providerFetch(`${GRAPH}/events/${encodeURIComponent(id)}`, { method: "DELETE", accessToken: token });
    }
  },
};

export function mailAdapter(p: ProviderId): MailAdapter {
  return p === "google" ? googleMail : microsoftMail;
}
export function calendarAdapter(p: ProviderId): CalendarAdapter {
  return p === "google" ? googleCalendar : microsoftCalendar;
}
