import { describe, expect, it } from "vitest";
import { guessMapping } from "@/lib/import/fields";
import { cleanRow, normaliseCompanyName, parseCustomerGroup, planImport, summarisePlan, type ExistingRecords } from "@/lib/import/plan";
import { domainFromWebsite } from "@/lib/enrichment/website";

const headers = ["Company", "Website", "Customer group", "First name", "Last name", "Email", "Phone"];
const mapping = guessMapping(headers);

const row = (company: string, website: string, first: string, email: string, group = "") => ({
  Company: company,
  Website: website,
  "Customer group": group,
  "First name": first,
  "Last name": "Example",
  Email: email,
  Phone: "",
});

const noneExisting = (): ExistingRecords => ({
  companiesByDomain: new Map(),
  companiesByName: new Map(),
  contactsByEmail: new Map(),
  suppressedEmails: new Set(),
});

describe("matching columns", () => {
  it("guesses the usual column headings", () => {
    expect(mapping).toMatchObject({ companyName: "Company", website: "Website", customerGroup: "Customer group", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone" });
  });
});

describe("cleaning values", () => {
  it("turns different ways of writing a website into the same domain", () => {
    expect(domainFromWebsite("https://www.Example-Fund.co.uk/about")).toBe("example-fund.co.uk");
    expect(domainFromWebsite("example-fund.co.uk")).toBe("example-fund.co.uk");
    expect(domainFromWebsite("http://WWW.example-fund.co.uk")).toBe("example-fund.co.uk");
    expect(domainFromWebsite("not a website")).toBeNull();
  });

  it("ignores company endings and punctuation when comparing names", () => {
    expect(normaliseCompanyName("Harbourline Real Estate Partners Ltd.")).toBe(normaliseCompanyName("HARBOURLINE real estate partners limited"));
    expect(normaliseCompanyName("Calder & Rowe LLP")).toBe(normaliseCompanyName("Calder and Rowe"));
  });

  it("understands customer group names", () => {
    expect(parseCustomerGroup("Asset and ESG")).toBe("ASSET_ESG");
    expect(parseCustomerGroup("Managing agent")).toBe("PROPERTY_MANAGER");
    expect(parseCustomerGroup("Occupier")).toBe("OCCUPIER");
    expect(parseCustomerGroup("")).toBeNull();
    expect(parseCustomerGroup("Bakery")).toBe("invalid");
  });

  it("refuses personal email addresses", () => {
    const { errors } = cleanRow(row("Fund", "", "Sam", "sam@gmail.com"), mapping);
    expect(errors[0]).toMatch(/personal email/);
  });
});

describe("duplicate detection within the file", () => {
  it("creates a company once and links later rows with the same website to it", () => {
    const plans = planImport(
      [row("Ashdown Fund", "www.ashdown.example", "Priya", "priya@ashdown.example"), row("Ashdown Fund Ltd", "https://ashdown.example", "Mark", "mark@ashdown.example")],
      mapping,
      noneExisting(),
      { duplicateContacts: "skip" },
    );
    expect(plans[0].company.kind).toBe("create");
    expect(plans[1].company).toMatchObject({ kind: "same_as_row", row: 1 });
    expect(plans.map((p) => p.contact.kind)).toEqual(["create", "create"]);
  });

  it("matches companies by name when there is no website", () => {
    const plans = planImport([row("Corrie Estates", "", "A", "a@corrie.example"), row("Corrie Estates Limited", "", "B", "b@corrie.example")], mapping, noneExisting(), { duplicateContacts: "skip" });
    expect(plans[1].company).toMatchObject({ kind: "same_as_row", row: 1 });
  });

  it("skips a second contact with the same email, whatever the capitals", () => {
    const plans = planImport([row("Linden", "linden.example", "Omar", "omar@linden.example"), row("Linden", "linden.example", "Omar", "OMAR@Linden.example")], mapping, noneExisting(), { duplicateContacts: "skip" });
    expect(plans[1].contact).toEqual({ kind: "skip", reason: "Same email address as row 1." });
  });
});

describe("duplicate detection against the CRM", () => {
  const existing: ExistingRecords = {
    companiesByDomain: new Map([["harbourline.example", "company_1"]]),
    companiesByName: new Map([[normaliseCompanyName("Northgate Pension Fund"), "company_2"]]),
    contactsByEmail: new Map([["grace@harbourline.example", "contact_1"]]),
    suppressedEmails: new Set(["optedout@harbourline.example"]),
  };

  it("links to an existing company found by website", () => {
    const [plan] = planImport([row("Harbourline Partners", "https://www.harbourline.example", "Nina", "nina@harbourline.example")], mapping, existing, { duplicateContacts: "skip" });
    expect(plan.company).toEqual({ kind: "existing", id: "company_1" });
    expect(plan.contact.kind).toBe("create");
  });

  it("links to an existing company found by name", () => {
    const [plan] = planImport([row("Northgate Pension Fund Ltd", "", "Helen", "helen@northgate.example")], mapping, existing, { duplicateContacts: "skip" });
    expect(plan.company).toEqual({ kind: "existing", id: "company_2" });
  });

  it("skips or fills in an existing contact, as chosen", () => {
    const input = [row("Harbourline", "harbourline.example", "Grace", "Grace@Harbourline.example")];
    expect(planImport(input, mapping, existing, { duplicateContacts: "skip" })[0].contact).toEqual({ kind: "skip", reason: "A contact with this email address already exists." });
    expect(planImport(input, mapping, existing, { duplicateContacts: "update" })[0].contact).toEqual({ kind: "update", id: "contact_1" });
  });

  it("never imports someone on the opt out list", () => {
    const [plan] = planImport([row("Harbourline", "harbourline.example", "Opted", "optedout@harbourline.example")], mapping, existing, { duplicateContacts: "update" });
    expect(plan.contact.kind).toBe("skip");
    expect(plan.contact.kind === "skip" && plan.contact.reason).toMatch(/asked not to be contacted/);
  });

  it("summarises what will happen", () => {
    const plans = planImport(
      [
        row("Harbourline", "harbourline.example", "Grace", "grace@harbourline.example"),
        row("New Co", "newco.example", "Ann", "ann@newco.example"),
        row("New Co", "newco.example", "Bob", "bob@gmail.com"),
      ],
      mapping,
      existing,
      { duplicateContacts: "skip" },
    );
    expect(summarisePlan(plans)).toMatchObject({ companiesToCreate: 1, companiesExisting: 1, companiesRepeated: 1, contactsToCreate: 1, contactsSkipped: 2 });
  });
});
