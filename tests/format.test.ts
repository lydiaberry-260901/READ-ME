import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatPounds, formatTime } from "@/lib/format";

describe("British formats in the Europe/London time zone", () => {
  it("writes dates as day/month/year", () => {
    expect(formatDate(new Date("2026-03-04T12:00:00Z"))).toBe("04/03/2026");
  });

  it("uses the 24 hour clock and British Summer Time", () => {
    // 13:30 UTC in July is 14:30 in London.
    expect(formatTime(new Date("2026-07-01T13:30:00Z"))).toBe("14:30");
    // In January London is on UTC.
    expect(formatTime(new Date("2026-01-15T18:05:00Z"))).toBe("18:05");
  });

  it("moves to the next day in London when needed", () => {
    expect(formatDateTime(new Date("2026-06-30T23:30:00Z"))).toBe("01/07/2026 00:30");
  });

  it("shows money in whole pounds", () => {
    expect(formatPounds(48000)).toBe("£48,000");
    expect(formatPounds(null)).toBe("£0");
  });

  it("shows a clear placeholder for missing dates", () => {
    expect(formatDate(null)).toBe("Not set");
  });
});
