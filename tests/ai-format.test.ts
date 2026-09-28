import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiAnswerError, runAiTask, setAiProviderForTests, type AiProvider } from "@/lib/ai";
import { buildCompanyInput, buildCompanySummaryPrompts, checkCompanySummary, companySummaryOutputSchema } from "@/lib/companies/summary";
import { costMicroUsd } from "@/lib/ai/pricing";
import { hasTestDb, resetTestDb, testDb } from "./helpers/db";

const good = {
  summary: "Harbourline owns multi let offices in the UK. Moca could help it prioritise EPC upgrades and automate tenant billing.",
  score: 4,
  scoreReason: "UK owner of multi let offices with likely EPC exposure.",
  suggestedCustomerGroup: "ASSET_ESG",
  keyFacts: ["Owns 14 buildings"],
  missingInformation: ["EPC ratings of the buildings"],
};

describe("checking the AI answer for a company summary", () => {
  it("accepts a well formed answer", () => {
    const result = checkCompanySummary(good);
    expect(result.score).toBe(4);
    expect(result.suggestedCustomerGroup).toBe("ASSET_ESG");
    expect(result.keyFacts).toEqual(["Owns 14 buildings"]);
  });

  it("rejects scores outside 1 to 5 or not whole numbers", () => {
    expect(() => checkCompanySummary({ ...good, score: 6 })).toThrow(AiAnswerError);
    expect(() => checkCompanySummary({ ...good, score: 0 })).toThrow(AiAnswerError);
    expect(() => checkCompanySummary({ ...good, score: 3.5 })).toThrow(AiAnswerError);
  });

  it("requires the summary to be 2 or 3 sentences", () => {
    expect(() => checkCompanySummary({ ...good, summary: "Just one sentence." })).toThrow(/2 or 3 sentences/);
    expect(() => checkCompanySummary({ ...good, summary: "One. Two. Three. Four." })).toThrow(/2 or 3 sentences/);
  });

  it("requires a one line reason", () => {
    expect(() => checkCompanySummary({ ...good, scoreReason: "" })).toThrow(AiAnswerError);
    expect(() => checkCompanySummary({ ...good, scoreReason: "x".repeat(300) })).toThrow(/one short line/);
  });

  it("rejects answers with missing or wrongly typed parts", () => {
    expect(() => checkCompanySummary({ ...good, summary: undefined })).toThrow(AiAnswerError);
    expect(() => checkCompanySummary({ ...good, suggestedCustomerGroup: "BAKERY" })).toThrow(AiAnswerError);
    expect(() => checkCompanySummary("not an object")).toThrow(AiAnswerError);
  });

  it("treats an unsure customer group as no suggestion", () => {
    expect(checkCompanySummary({ ...good, suggestedCustomerGroup: "UNSURE" }).suggestedCustomerGroup).toBeNull();
  });

  it("removes dashes used as punctuation", () => {
    const result = checkCompanySummary({ ...good, summary: "Harbourline owns offices — mostly multi-let. Moca could help." });
    expect(result.summary).toBe("Harbourline owns offices, mostly multi-let. Moca could help.");
  });
});

describe("what is sent to the AI", () => {
  const company = {
    name: "Harbourline Real Estate Partners",
    alternativeNames: [],
    website: "https://www.harbourline-demo.example",
    customerGroup: "ASSET_ESG" as const,
    description: "Contact jane.doe@harbourline-demo.example or call 01632 960100 for details.",
    portfolioSize: "14 buildings",
    headOffice: "London",
    companiesHouseNumber: null,
    enrichment: null,
  };

  it("includes company facts but removes email addresses and phone numbers", () => {
    const input = buildCompanyInput(company);
    expect(input).toContain("Harbourline Real Estate Partners");
    expect(input).toContain("14 buildings");
    expect(input).not.toContain("jane.doe@");
    expect(input).not.toContain("01632 960100");
    expect(input).toContain("[email removed]");
  });

  it("puts the versioned scoring guide in the instructions and tells the AI never to invent facts", () => {
    const { system } = buildCompanySummaryPrompts(company);
    expect(system).toContain("Moca company scoring guide, version 1");
    expect(system).toMatch(/Never invent facts/);
    expect(system).toContain("5.7 million square feet");
  });

  it("asks for the fixed answer shape", () => {
    expect(Object.keys(companySummaryOutputSchema.shape).sort()).toEqual(
      ["keyFacts", "missingInformation", "score", "scoreReason", "suggestedCustomerGroup", "summary"],
    );
  });
});

describe.skipIf(!hasTestDb)("running an AI task", () => {
  let calls = 0;
  const answers: unknown[] = [];
  const fake: AiProvider = {
    name: "fake",
    isConfigured: () => true,
    async generateStructured() {
      calls++;
      return { data: answers.shift(), model: "claude-opus-5", inputTokens: 1000, outputTokens: 200 };
    },
  };

  beforeEach(async () => {
    await resetTestDb();
    calls = 0;
    answers.length = 0;
    setAiProviderForTests(fake);
  });
  afterEach(() => setAiProviderForTests(fake));

  const task = { feature: "company_summary", promptVersion: "test", organisationId: null, userId: null, system: "s", user: "u", outputSchema: companySummaryOutputSchema, check: checkCompanySummary };

  it("records usage and cost for every request", async () => {
    answers.push(good);
    const { result } = await runAiTask(task);
    expect(result.score).toBe(4);
    const usage = await testDb.aiUsage.findMany();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ success: true, model: "claude-opus-5", inputTokens: 1000, outputTokens: 200, costMicroUsd: costMicroUsd("claude-opus-5", 1000, 200) });
  });

  it("tries once more if the answer breaks the rules, then gives up", async () => {
    answers.push({ ...good, score: 9 }, { ...good, score: 9 });
    await expect(runAiTask(task)).rejects.toThrow(AiAnswerError);
    expect(calls).toBe(2);
    expect(await testDb.aiUsage.count({ where: { success: false } })).toBe(2);
  });

  it("uses a good second answer after a bad first one", async () => {
    answers.push({ ...good, summary: "Too short." }, good);
    const { result } = await runAiTask(task);
    expect(result.score).toBe(4);
    expect(calls).toBe(2);
  });
});

describe("cost estimate", () => {
  it("prices Claude Opus 5 at $5 in and $25 out per million tokens", () => {
    expect(costMicroUsd("claude-opus-5", 1_000_000, 0)).toBe(5_000_000);
    expect(costMicroUsd("claude-opus-5", 0, 1_000_000)).toBe(25_000_000);
  });
});
