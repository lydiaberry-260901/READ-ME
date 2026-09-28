// Email and calendar, tested against pretend Google and Microsoft accounts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setFetchForTests, ProviderError } from "@/lib/integrations/http";
import { readStateCookie, startConnection, emailFromIdToken } from "@/lib/integrations/oauth";
import { buildMime } from "@/lib/integrations/mime";

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A pretend internet: routes requests to handlers by method and address, and records them. */
function pretend(routes: [string, RegExp, Handler][]) {
  const calls: { method: string; url: string; body: string | null; headers: Headers }[] = [];
  setFetchForTests(async (input, init = {}) => {
    const url = new URL(input);
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, url: url.toString(), body: typeof init.body === "string" ? init.body : null, headers: new Headers(init.headers) });
    const route = routes.find(([m, re]) => m === method && re.test(url.origin + url.pathname));
    if (!route) return new Response(`No pretend route for ${method} ${url}`, { status: 404 });
    return route[2](url, init);
  });
  return calls;
}

afterEach(() => setFetchForTests(null));

describe("connecting safely", () => {
  it("asks only for the access each feature needs, with a one time proof key", () => {
    process.env.AUTH_GOOGLE_ID = "client";
    process.env.APP_URL = "https://crm.example";
    const { url, cookieValue } = startConnection("google", "calendar", "user_1");
    const u = new URL(url);
    expect(u.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.events");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("https://crm.example/api/connect/callback/google");
    const state = readStateCookie(cookieValue)!;
    expect(state).toMatchObject({ userId: "user_1", provider: "google", kind: "calendar", state: u.searchParams.get("state") });
  });

  it("rejects a handshake cookie that has been tampered with", () => {
    const { cookieValue } = startConnection("microsoft", "email", "user_1");
    expect(readStateCookie(`${cookieValue.slice(0, -4)}AAAA`)).toBeNull();
    expect(readStateCookie(undefined)).toBeNull();
  });

  it("reads the email address from the sign in token", () => {
    const token = `x.${Buffer.from(JSON.stringify({ email: "Aisha@Moca.Energy" })).toString("base64url")}.y`;
    expect(emailFromIdToken(token)).toBe("aisha@moca.energy");
  });
});

describe("the email format", () => {
  it("includes the one click unsubscribe headers and encodes the message safely", () => {
    const mime = buildMime({ from: "aisha@moca.energy", fromName: "Aisha Rahman", to: ["grace@harbourline.example"], subject: "EPC risk £ plan", text: "Hello Grace", messageId: "<abc@crm>", unsubscribeUrl: "https://crm/u/t", oneClickUrl: "https://crm/api/u/t" });
    expect(mime).toContain("To: grace@harbourline.example");
    expect(mime).toContain("List-Unsubscribe: <https://crm/api/u/t>");
    expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain(Buffer.from("Hello Grace").toString("base64"));
  });
});

// ---------------------------------------------------------------------------
// Against the test database
// ---------------------------------------------------------------------------
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { encrypt } from "@/lib/crypto";
import { syncMailAccount } from "@/lib/integrations/mail-sync";
import { syncCalendarAccount } from "@/lib/integrations/calendar-sync";
import { sendDraft } from "@/lib/integrations/send";
import { createMeeting } from "@/lib/integrations/meetings";
import { createEmailDraft } from "@/lib/outreach/drafts";
import type { Actor } from "@/lib/permissions";

describe.skipIf(!hasTestDb)("email and calendar with pretend accounts", () => {
  let orgId: string;
  let rep: Actor;
  let contactId: string;
  let dealId: string;
  let templateId: string;
  const future = new Date(Date.now() + 3_600_000);
  const tokens = { accessTokenEnc: encrypt("access-token"), refreshTokenEnc: encrypt("refresh-token"), tokenExpiresAt: future };

  beforeEach(async () => {
    await resetTestDb();
    process.env.APP_URL = "https://crm.example";
    const org = await createOrganisation(testDb, "Moca");
    orgId = org.id;
    await testDb.organisation.update({ where: { id: orgId }, data: { legalName: "Moca Example Ltd", privacyNoticeUrl: "https://moca.energy/privacy" } });
    const u = await testDb.user.create({ data: { email: "aisha@moca.energy", name: "Aisha Rahman", jobTitle: "Account Executive", organisationId: orgId, role: "REP" } });
    rep = { id: u.id, organisationId: orgId, role: "REP", visibleOwnerIds: [u.id] };
    const company = await testDb.company.create({ data: { organisationId: orgId, name: "Harbourline", customerGroup: "ASSET_ESG", ownerId: u.id } });
    const contact = await testDb.contact.create({
      data: { organisationId: orgId, companyId: company.id, firstName: "Grace", email: "grace@harbourline.example", emailNormalised: "grace@harbourline.example", source: "Test", entityType: "LIMITED_COMPANY", ownerId: u.id },
    });
    contactId = contact.id;
    const pipeline = await testDb.pipeline.findFirstOrThrow({ where: { organisationId: orgId }, include: { stages: { orderBy: { position: "asc" } } } });
    const deal = await testDb.deal.create({ data: { organisationId: orgId, pipelineId: pipeline.id, stageId: pipeline.stages[1].id, companyId: company.id, ownerId: u.id, name: "Platform" } });
    dealId = deal.id;
    await testDb.dealContact.create({ data: { dealId, contactId } });
    templateId = (await testDb.emailTemplate.findFirstOrThrow({ where: { organisationId: orgId, customerGroup: "ASSET_ESG" } })).id;
  });

  const gmailMessage = (id: string, thread: string, from: string, to: string, at: string, subject: string, messageId?: string) => ({
    id, threadId: thread, snippet: `Snippet of ${subject}`, internalDate: String(new Date(at).getTime()),
    payload: { headers: [{ name: "From", value: from }, { name: "To", value: to }, { name: "Subject", value: subject }, ...(messageId ? [{ name: "Message-ID", value: messageId }] : [])] },
  });

  it("saves only emails with CRM contacts, links the deal, spots replies, and never saves twice (Google)", async () => {
    const account = await testDb.emailAccount.create({ data: { userId: rep.id, provider: "GOOGLE", emailAddress: "aisha@moca.energy", ...tokens } });
    const messages = [
      gmailMessage("m1", "t1", "Aisha <aisha@moca.energy>", "Grace <grace@harbourline.example>", "2026-09-20T09:00:00Z", "Proposal"),
      gmailMessage("m2", "t1", "grace@harbourline.example", "aisha@moca.energy", "2026-09-21T09:00:00Z", "Re: Proposal"),
      gmailMessage("m3", "t9", "friend@gmail.com", "aisha@moca.energy", "2026-09-21T10:00:00Z", "Dinner on Friday?"),
    ];
    const calls = pretend([
      ["GET", /gmail\/v1\/users\/me\/messages$/, () => json({ messages: messages.map((m) => ({ id: m.id })) })],
      ["GET", /gmail\/v1\/users\/me\/messages\/m\d$/, (u) => json(messages.find((m) => u.pathname.endsWith(m.id)))],
    ]);

    const first = await syncMailAccount(account.id, new Date("2026-09-22T09:00:00Z"));
    expect(first).toEqual({ status: "ok", saved: 2, ignored: 1 });
    expect(calls[0].headers.get("authorization")).toBe("Bearer access-token");
    const saved = await testDb.email.findMany({ orderBy: { sentAt: "asc" } });
    expect(saved.map((e) => [e.direction, e.subject, e.contactId === contactId, e.dealId === dealId])).toEqual([
      ["SENT", "Proposal", true, true],
      ["RECEIVED", "Re: Proposal", true, true],
    ]);
    expect(saved[0].repliedAt?.toISOString()).toBe("2026-09-21T09:00:00.000Z");
    expect(saved[0].isFirstContact).toBe(true);
    expect(await testDb.email.count({ where: { subject: { contains: "Dinner" } } })).toBe(0);
    expect((await testDb.deal.findUniqueOrThrow({ where: { id: dealId } })).lastActivityAt?.toISOString()).toBe("2026-09-21T09:00:00.000Z");

    const again = await syncMailAccount(account.id, new Date("2026-09-22T09:10:00Z"));
    expect(again.saved).toBe(0);
    expect(await testDb.email.count()).toBe(2);
  });

  it("marks the account as needing reconnection when access has been removed", async () => {
    const account = await testDb.emailAccount.create({ data: { userId: rep.id, provider: "MICROSOFT", emailAddress: "aisha@moca.energy", accessTokenEnc: encrypt("old"), refreshTokenEnc: encrypt("revoked"), tokenExpiresAt: new Date(Date.now() - 1000) } });
    pretend([["POST", /oauth2\/v2\.0\/token$/, () => json({ error: "invalid_grant" }, 400)]]);
    const r = await syncMailAccount(account.id);
    expect(r.status).toBe("expired");
    const after = await testDb.emailAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.status).toBe("EXPIRED");
    expect(after.lastError).toMatch(/reconnect/);
  });

  it("refreshes an expiring token and saves the new one, encrypted", async () => {
    const account = await testDb.emailAccount.create({ data: { userId: rep.id, provider: "MICROSOFT", emailAddress: "aisha@moca.energy", accessTokenEnc: encrypt("old"), refreshTokenEnc: encrypt("r1"), tokenExpiresAt: new Date(Date.now() + 30_000) } });
    const calls = pretend([
      ["POST", /oauth2\/v2\.0\/token$/, () => json({ access_token: "new-access", refresh_token: "r2", expires_in: 3600 })],
      ["GET", /graph\.microsoft\.com\/v1\.0\/me\/messages$/, () => json({ value: [] })],
    ]);
    await syncMailAccount(account.id);
    expect(calls[1].headers.get("authorization")).toBe("Bearer new-access");
    const after = await testDb.emailAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.accessTokenEnc).not.toContain("new-access");
    expect(after.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 3_000_000);
  });

  it("leaves limits from the service to the automatic retries, keeping a clear message", async () => {
    const account = await testDb.emailAccount.create({ data: { userId: rep.id, provider: "MICROSOFT", emailAddress: "aisha@moca.energy", ...tokens } });
    pretend([["GET", /graph\.microsoft\.com\/v1\.0\/me\/messages$/, () => json({ error: "Too many requests" }, 429, { "retry-after": "30" })]]);
    await expect(syncMailAccount(account.id)).rejects.toBeInstanceOf(ProviderError);
    const after = await testDb.emailAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.lastError).toMatch(/slow down/);
  });

  it("sends a draft from the person's own account with the footer, and records it once when it syncs back (Microsoft)", async () => {
    const account = await testDb.emailAccount.create({ data: { userId: rep.id, provider: "MICROSOFT", emailAddress: "aisha@moca.energy", ...tokens } });
    let sentMime = "";
    pretend([
      ["POST", /graph\.microsoft\.com\/v1\.0\/me\/sendMail$/, (_u, init) => { sentMime = Buffer.from(String(init.body), "base64").toString("utf8"); return new Response(null, { status: 202 }); }],
    ]);
    const draft = await createEmailDraft(rep, { contactId, templateId, useAi: false });
    const email = await sendDraft(rep, draft.id, new Date("2026-09-23T10:00:00Z"));

    expect(sentMime).toContain("To: grace@harbourline.example");
    expect(sentMime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    const body = Buffer.from(sentMime.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(body).toContain("Hello Grace");
    expect(body).toContain("https://moca.energy/privacy");
    expect(body).toContain("https://crm.example/unsubscribe/");

    expect(email).toMatchObject({ direction: "SENT", emailTemplateId: templateId, isFirstContact: true, dealId });
    expect((await testDb.outreachDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("SENT");
    expect((await testDb.contact.findUniqueOrThrow({ where: { id: contactId } })).privacyNoticeSentAt?.toISOString()).toBe("2026-09-23T10:00:00.000Z");

    // When it comes back through the sync, it fills in Microsoft's ids rather than saving a second copy.
    pretend([
      ["GET", /graph\.microsoft\.com\/v1\.0\/me\/messages$/, () => json({ value: [{ id: "graph-1", conversationId: "conv-1", internetMessageId: email.internetMessageId, subject: email.subject, bodyPreview: "Hello", from: { emailAddress: { address: "aisha@moca.energy" } }, toRecipients: [{ emailAddress: { address: "grace@harbourline.example" } }], sentDateTime: "2026-09-23T10:00:00Z", receivedDateTime: "2026-09-23T10:00:00Z" }] })],
    ]);
    await syncMailAccount(account.id, new Date("2026-09-23T10:10:00Z"));
    const all = await testDb.email.findMany();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ providerMessageId: "graph-1", threadId: "conv-1" });
  });

  it("refuses to send if the person opted out after the draft was written, or no email account is connected", async () => {
    const draft = await createEmailDraft(rep, { contactId, templateId, useAi: false });
    await expect(sendDraft(rep, draft.id)).rejects.toThrow(/Connect your email account/);
    await testDb.emailAccount.create({ data: { userId: rep.id, provider: "GOOGLE", emailAddress: "aisha@moca.energy", ...tokens } });
    await testDb.contact.update({ where: { id: contactId }, data: { optedOut: true } });
    const calls = pretend([]);
    await expect(sendDraft(rep, draft.id)).rejects.toThrow(/opted out/);
    expect(calls).toHaveLength(0);
  });

  it("brings in calendar events with contacts and notices events deleted in Outlook", async () => {
    const account = await testDb.calendarAccount.create({ data: { userId: rep.id, provider: "MICROSOFT", emailAddress: "aisha@moca.energy", ...tokens } });
    const soon = new Date(Date.now() + 2 * 86_400_000);
    const event = { id: "ev1", subject: "Demo with Harbourline", start: { dateTime: soon.toISOString().replace("Z", "") }, end: { dateTime: new Date(soon.getTime() + 3_600_000).toISOString().replace("Z", "") }, attendees: [{ emailAddress: { address: "Grace@Harbourline.example", name: "Grace" } }] };
    pretend([["GET", /graph\.microsoft\.com\/v1\.0\/me\/calendarView$/, () => json({ value: [event] })]]);
    await syncCalendarAccount(account.id);
    let saved = await testDb.calendarEvent.findFirstOrThrow();
    expect(saved).toMatchObject({ title: "Demo with Harbourline", contactId, dealId, cancelled: false });
    expect(saved.startAt.toISOString()).toBe(soon.toISOString());

    pretend([["GET", /graph\.microsoft\.com\/v1\.0\/me\/calendarView$/, () => json({ value: [] })]]);
    await syncCalendarAccount(account.id);
    saved = await testDb.calendarEvent.findFirstOrThrow();
    expect(saved.cancelled).toBe(true);
  });

  it("books a meeting in Google Calendar, sending an invitation only when asked", async () => {
    await testDb.calendarAccount.create({ data: { userId: rep.id, provider: "GOOGLE", emailAddress: "aisha@moca.energy", ...tokens } });
    let n = 0;
    const calls = pretend([
      ["POST", /calendar\/v3\/calendars\/primary\/events$/, (_u, init) => {
        const b = JSON.parse(String(init.body));
        return json({ id: `g${++n}`, summary: b.summary, start: b.start, end: b.end, attendees: b.attendees });
      }],
    ]);
    const start = new Date("2026-10-01T09:00:00Z");
    const event = await createMeeting(rep, { title: "Demo", startAt: start, durationMinutes: 45, location: null, description: null, contactId, dealId, sendInvites: false });
    expect(new URL(calls[0].url).searchParams.get("sendUpdates")).toBe("none");
    expect(event).toMatchObject({ providerEventId: "g1", contactId, dealId });
    expect(event.endAt.toISOString()).toBe("2026-10-01T09:45:00.000Z");

    await createMeeting(rep, { title: "Demo 2", startAt: start, durationMinutes: 30, location: null, description: null, contactId, dealId, sendInvites: true });
    expect(new URL(calls[1].url).searchParams.get("sendUpdates")).toBe("all");
  });

  it("keeps meetings in the CRM when no calendar is connected, but will not send invitations", async () => {
    const start = new Date("2026-10-01T09:00:00Z");
    const local = await createMeeting(rep, { title: "Call", startAt: start, durationMinutes: 30, location: null, description: null, contactId, dealId: null, sendInvites: false });
    expect(local.calendarAccountId).toBeNull();
    await expect(createMeeting(rep, { title: "Call", startAt: start, durationMinutes: 30, location: null, description: null, contactId, dealId: null, sendInvites: true })).rejects.toThrow(/Connect your calendar/);
  });
});
