import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { findPlaceholders, renderTemplate, unknownPlaceholders } from "@/lib/outreach/merge";
import { assembleEmail, footerGaps, marketingFooter } from "@/lib/outreach/footer";
import { createUnsubscribeToken, readUnsubscribeToken } from "@/lib/outreach/unsubscribe";
import { STARTER_EMAILS, STARTER_SCRIPTS } from "@/lib/outreach/starter-library";
import { checkNoInventedNumbers, makeEmailChecker, makeScriptChecker } from "@/lib/outreach/ai";
import { AiAnswerError, setAiProviderForTests, type AiProvider } from "@/lib/ai";
import { ClaudeProvider } from "@/lib/ai/claude";

const org = { name: "Moca", legalName: "Moca Example Ltd", postalAddress: "1 Example Street, London", websiteUrl: "https://moca.energy", privacyNoticeUrl: "https://moca.energy/privacy" };

describe("merge fields", () => {
  it("fills in known fields and flags missing ones instead of leaving a gap", () => {
    const r = renderTemplate("Hello {{contact.firstName}}, news: {{news.headline}}. {{sender.name}}", { "contact.firstName": "Grace", "sender.name": "Aisha" });
    expect(r.text).toBe("Hello Grace, news: [[news.headline]]. Aisha");
    expect(r.missing).toEqual(["news.headline"]);
  });

  it("spots merge fields that do not exist", () => {
    expect(unknownPlaceholders("Hi {{contact.firstname}} at {{company.name}}")).toEqual(["contact.firstname"]);
    expect(findPlaceholders("{{company.name}} {{ company.name }}")).toEqual(["company.name"]);
  });
});

describe("the marketing email footer", () => {
  const footer = marketingFooter(org, "https://crm.example/unsubscribe/abc");

  it("says who we are, gives a privacy line and link, and a working unsubscribe link", () => {
    expect(footer).toContain("Moca Example Ltd, 1 Example Street, London");
    expect(footer).toContain("legitimate interests");
    expect(footer).toContain("https://moca.energy/privacy");
    expect(footer).toContain("https://crm.example/unsubscribe/abc");
  });

  it("is always added after whatever the person wrote, so it cannot be removed", () => {
    const sent = assembleEmail("Hello Grace,\n\nShort note.\n\n", footer);
    expect(sent.endsWith(footer)).toBe(true);
    expect(sent.startsWith("Hello Grace,")).toBe(true);
  });

  it("does not use dashes as punctuation", () => {
    expect(footer).not.toMatch(/\s[-–—]+\s|^--/m);
  });

  it("lists what an admin still needs to fill in", () => {
    expect(footerGaps({ ...org, legalName: null, privacyNoticeUrl: null })).toEqual(["the company's legal name", "a link to the full privacy notice"]);
  });
});

describe("unsubscribe links", () => {
  it("can be read back", () => {
    expect(readUnsubscribeToken(createUnsubscribeToken("org_1", "contact_1"))).toEqual({ organisationId: "org_1", contactId: "contact_1" });
  });

  it("cannot be altered to opt out someone else", () => {
    const token = createUnsubscribeToken("org_1", "contact_1");
    const [, sig] = token.split(".");
    const forged = `${Buffer.from("org_1:contact_2").toString("base64url")}.${sig}`;
    expect(readUnsubscribeToken(forged)).toBeNull();
    expect(readUnsubscribeToken("nonsense")).toBeNull();
    expect(readUnsubscribeToken(`${token}x`)).toBeNull();
  });
});

describe("the starter library", () => {
  const groups = ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER"] as const;
  const mocaFacts = "more than 5.7 million square feet, about £500,000 saved for Octopus Real Estate";

  it("has at least three email templates and two call scripts for each customer group", () => {
    for (const g of groups) {
      expect(STARTER_EMAILS.filter((e) => e.group === g).length).toBeGreaterThanOrEqual(3);
      expect(STARTER_SCRIPTS.filter((s) => s.group === g).length).toBeGreaterThanOrEqual(2);
    }
  });

  const allText = [
    ...STARTER_EMAILS.flatMap((e) => [e.subject, e.body]),
    ...STARTER_SCRIPTS.flatMap((s) => [s.opening, ...s.questions, ...s.objections.flatMap((o) => [o.objection, o.response]), s.ask]),
  ];

  it("uses only real merge fields", () => {
    expect(allText.flatMap(unknownPlaceholders)).toEqual([]);
  });

  it("only uses figures from the Moca information in the brief", () => {
    for (const t of allText) expect(() => checkNoInventedNumbers(t, mocaFacts)).not.toThrow();
  });

  it("does not use dashes as punctuation", () => {
    for (const t of allText) expect(t).not.toMatch(/\s[-–—]\s|—|–/);
  });
});

describe("checking AI drafts", () => {
  const sources = "Template: saved about £500,000 compared with a consultant. More than 5.7 million square feet. A 20 minute call.";
  const template = "Hello {{contact.firstName}},\n\nShort template body that is long enough to compare against.\n\nBest wishes,\n{{sender.name}}";
  const check = makeEmailChecker(sources, template);
  const good = {
    subject: "Energy at {{company.name}}",
    body: "Hello {{contact.firstName}},\n\nMoca manages more than 5.7 million square feet. Could we have a 15 minute call?\n\nBest wishes,\n{{sender.name}}",
    personalisationNotes: ["Mentioned the portfolio"],
    missingInformation: [],
  };

  it("accepts a draft that only uses figures it was given", () => {
    expect(check(good).subject).toBe("Energy at {{company.name}}");
  });

  it("rejects figures that were not in the information given", () => {
    expect(() => check({ ...good, body: good.body.replace("5.7 million", "12 million") })).toThrow(/figures that were not in the information given \(12\)/);
  });

  it("rejects made up merge fields", () => {
    expect(() => check({ ...good, body: `${good.body} {{contact.email}}` })).toThrow(/placeholders that do not exist/);
  });

  it("rejects drafts that add their own unsubscribe or privacy text", () => {
    expect(() => check({ ...good, body: `${good.body}\nUnsubscribe here.` })).toThrow(AiAnswerError);
  });

  it("needs exactly three questions in a call script", () => {
    const script = { opening: "Hello {{contact.firstName}}.", questions: ["One?", "Two?"], objections: [{ objection: "a", response: "b" }, { objection: "c", response: "d" }], ask: "Could we meet?", missingInformation: [] };
    expect(() => makeScriptChecker(sources)(script)).toThrow(/exactly three questions/);
    expect(makeScriptChecker(sources)({ ...script, questions: ["One?", "Two?", "Three?"] }).questions).toHaveLength(3);
  });
});

// Database tests: blocking rules, drafts and the unsubscribe page.
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";
import { createOrganisation } from "@/lib/organisation";
import { createEmailDraft, createScriptDraft, markScriptReady, ownDraft } from "@/lib/outreach/drafts";
import { OutreachBlockedError } from "@/lib/outreach/context";
import { unsubscribeByToken } from "@/lib/outreach/unsubscribe-handler";
import { isSuppressed } from "@/lib/contacts/opt-out";
import type { Actor } from "@/lib/permissions";

describe.skipIf(!hasTestDb)("outreach rules against the database", () => {
  let rep: Actor;
  let otherRep: Actor;
  let orgId: string;
  let templateId: string;
  let scriptId: string;
  let seenByAi = "";

  const fakeAi: AiProvider = {
    name: "fake",
    isConfigured: () => true,
    async generateStructured(req) {
      seenByAi = `${req.system}\n${req.user}`;
      return {
        data: {
          subject: "Energy at {{company.name}}",
          body: "Hello {{contact.firstName}},\n\nMoca already manages more than 5.7 million square feet. Could we talk?\n\nBest wishes,\n{{sender.name}}",
          personalisationNotes: ["Used the company group"],
          missingInformation: ["Recent news"],
        },
        model: "claude-opus-5",
        inputTokens: 10,
        outputTokens: 10,
      };
    },
  };

  beforeEach(async () => {
    await resetTestDb();
    setAiProviderForTests(fakeAi);
    const org = await createOrganisation(testDb, "Moca");
    orgId = org.id;
    const u = await testDb.user.create({ data: { email: "rep@example.com", name: "Aisha Rep", organisationId: org.id, role: "REP", jobTitle: "Account Executive" } });
    const u2 = await testDb.user.create({ data: { email: "rep2@example.com", name: "Tom Rep", organisationId: org.id, role: "REP" } });
    rep = { id: u.id, organisationId: org.id, role: "REP", visibleOwnerIds: [u.id] };
    otherRep = { id: u2.id, organisationId: org.id, role: "REP", visibleOwnerIds: [u2.id] };
    templateId = (await testDb.emailTemplate.findFirstOrThrow({ where: { organisationId: org.id, customerGroup: "ASSET_ESG" } })).id;
    scriptId = (await testDb.callScript.findFirstOrThrow({ where: { organisationId: org.id } })).id;
  });

  afterAll(() => setAiProviderForTests(new ClaudeProvider()));

  async function contact(overrides: Record<string, unknown> = {}) {
    const company = await testDb.company.create({ data: { organisationId: orgId, name: "Harbourline", customerGroup: "ASSET_ESG", whyMatters: "Owns multi let offices." } });
    return testDb.contact.create({
      data: {
        organisationId: orgId, companyId: company.id, firstName: "Grace", lastName: "Okafor", jobTitle: "Head of ESG",
        email: "grace@harbourline.example", emailNormalised: "grace@harbourline.example", phone: "01632 960100",
        source: "Test", entityType: "LIMITED_COMPANY", ownerId: rep.id, ...overrides,
      },
    });
  }

  it("fills in the contact's name from the template, not from the AI", async () => {
    const c = await contact();
    const draft = await createEmailDraft(rep, { contactId: c.id, templateId, useAi: false });
    expect(draft.body).toContain("Hello Grace,");
    expect(draft.body).toContain("Aisha Rep");
    expect(draft.emailTemplateId).toBe(templateId);
    expect(draft.status).toBe("DRAFT");
  });

  it("never sends the contact's name or email address to the AI", async () => {
    const c = await contact();
    const draft = await createEmailDraft(rep, { contactId: c.id, templateId, useAi: true });
    expect(seenByAi).toContain("Head of ESG");
    expect(seenByAi).not.toContain("Grace");
    expect(seenByAi).not.toContain("Okafor");
    expect(seenByAi).not.toContain("grace@harbourline.example");
    expect(draft.body).toContain("Hello Grace,");
    expect(draft.aiGenerated).toBe(true);
  });

  it("blocks emails to people who opted out", async () => {
    const c = await contact({ optedOut: true });
    await expect(createEmailDraft(rep, { contactId: c.id, templateId, useAi: false })).rejects.toThrow(/opted out/);
  });

  it("blocks marketing emails to sole traders without consent, and allows them once consent is recorded", async () => {
    const c = await contact({ entityType: "SOLE_TRADER" });
    await expect(createEmailDraft(rep, { contactId: c.id, templateId, useAi: false })).rejects.toThrow(/consent/);
    await testDb.contact.update({ where: { id: c.id }, data: { consentAt: new Date() } });
    await expect(createEmailDraft(rep, { contactId: c.id, templateId, useAi: false })).resolves.toBeTruthy();
  });

  it("will not mark a call ready without a recent TPS and CTPS check", async () => {
    const c = await contact();
    const draft = await createScriptDraft(rep, { contactId: c.id, scriptId, useAi: false });
    await expect(markScriptReady(rep, draft.id)).rejects.toThrow(/TPS and CTPS/);

    await testDb.contact.update({ where: { id: c.id }, data: { phoneCheckedAt: new Date(Date.now() - 40 * 86_400_000), phoneCheckResult: "CLEAR" } });
    await expect(markScriptReady(rep, draft.id)).rejects.toThrow(/more than 28 days old/);

    await testDb.contact.update({ where: { id: c.id }, data: { phoneCheckedAt: new Date(), phoneCheckResult: "LISTED" } });
    await expect(markScriptReady(rep, draft.id)).rejects.toThrow(/do not call list/);

    await testDb.contact.update({ where: { id: c.id }, data: { phoneCheckResult: "CLEAR" } });
    expect((await markScriptReady(rep, draft.id)).status).toBe("READY");
  });

  it("keeps drafts private to the person who wrote them", async () => {
    const c = await contact({ isShared: true });
    const draft = await createEmailDraft(rep, { contactId: c.id, templateId, useAi: false });
    await expect(ownDraft(otherRep, draft.id)).rejects.toThrow(OutreachBlockedError);
  });

  it("the unsubscribe link opts the person out for everyone and adds them to the opt out list", async () => {
    const c = await contact();
    const { createUnsubscribeToken } = await import("@/lib/outreach/unsubscribe");
    expect(await unsubscribeByToken(createUnsubscribeToken(orgId, c.id))).toBe("done");
    expect((await testDb.contact.findUniqueOrThrow({ where: { id: c.id } })).optedOut).toBe(true);
    expect(await isSuppressed(orgId, "Grace@Harbourline.example")).toBe(true);
    expect(await unsubscribeByToken(createUnsubscribeToken(orgId, c.id))).toBe("already");
    await expect(createEmailDraft(otherRep, { contactId: c.id, templateId, useAi: false })).rejects.toThrow();
  });

  it("new organisations get the starter library", async () => {
    expect(await testDb.emailTemplate.count({ where: { organisationId: orgId } })).toBe(STARTER_EMAILS.length);
    expect(await testDb.callScript.count({ where: { organisationId: orgId } })).toBe(STARTER_SCRIPTS.length);
  });
});
