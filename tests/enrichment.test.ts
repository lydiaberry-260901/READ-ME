import { describe, expect, it } from "vitest";
import { isAllowedByRobots } from "@/lib/enrichment/robots";
import { isPrivateAddress } from "@/lib/enrichment/safe-fetch";
import { extractPageDetails } from "@/lib/enrichment/website";
import { normaliseCompanyNumber } from "@/lib/enrichment/companies-house";
import { redactPersonalDetails } from "@/lib/text";

const UA = "MocaCRM/1.0";

describe("respecting a website's robots.txt rules", () => {
  it("allows everything when there are no rules", () => {
    expect(isAllowedByRobots("", UA, "/")).toBe(true);
  });

  it("follows a block on all visitors", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow: /", UA, "/")).toBe(false);
  });

  it("treats an empty Disallow as allowing everything", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow:", UA, "/")).toBe(true);
  });

  it("uses rules written for us over the general ones", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: MocaCRM\nAllow: /";
    expect(isAllowedByRobots(robots, UA, "/")).toBe(true);
  });

  it("uses the most specific matching rule", () => {
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public";
    expect(isAllowedByRobots(robots, UA, "/private/secret")).toBe(false);
    expect(isAllowedByRobots(robots, UA, "/private/public/page")).toBe(true);
    expect(isAllowedByRobots(robots, UA, "/")).toBe(true);
  });
});

describe("never fetching addresses inside our own network", () => {
  it("blocks private and loopback addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.4", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
});

describe("reading a web page", () => {
  it("keeps the title, description and a short text excerpt, without scripts or personal details", () => {
    const html = `<html><head><title>Example Fund | Offices</title><meta name="description" content="UK office investor &amp; manager."></head>
      <body><nav>Menu</nav><script>track()</script><p>We own 14 buildings. Email info@example.com</p></body></html>`;
    const d = extractPageDetails(html);
    expect(d.title).toBe("Example Fund | Offices");
    expect(d.description).toBe("UK office investor & manager.");
    expect(d.textExcerpt).toContain("We own 14 buildings.");
    expect(d.textExcerpt).not.toContain("track()");
    expect(d.textExcerpt).not.toContain("info@example.com");
  });
});

describe("Companies House numbers", () => {
  it("pads short numbers and keeps Scottish prefixes", () => {
    expect(normaliseCompanyNumber("1234567")).toBe("01234567");
    expect(normaliseCompanyNumber("sc123456")).toBe("SC123456");
    expect(normaliseCompanyNumber("12 34 56 78")).toBe("12345678");
    expect(normaliseCompanyNumber("not-a-number!")).toBeNull();
  });
});

describe("removing personal details from text", () => {
  it("removes email addresses and phone numbers", () => {
    expect(redactPersonalDetails("Call +44 1632 960100 or email a.b@c.co.uk")).toBe("Call [phone removed] or email [email removed]");
  });
});
