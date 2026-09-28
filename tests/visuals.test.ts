import { describe, expect, it } from "vitest";
import { describeCron } from "@/lib/automation-overview";
import { evenTicks, niceCeiling } from "@/components/charts";

describe("automation timetables in plain English", () => {
  it("describes the timings the CRM uses", () => {
    expect(describeCron("*/15 * * * *")).toBe("Every 15 minutes");
    expect(describeCron("30 5 * * *")).toBe("Every day at 05:30");
    expect(describeCron("0 7 * * 1-5")).toBe("Every weekday at 07:00");
    expect(describeCron("30 6 * * 1")).toBe("Every Monday at 06:30");
  });
});

describe("chart scales", () => {
  it("rounds the top of a scale up to a tidy number", () => {
    expect(niceCeiling(0)).toBe(4);
    expect(niceCeiling(7)).toBe(10);
    expect(niceCeiling(27)).toBe(50);
    expect(niceCeiling(18)).toBe(20);
    expect(niceCeiling(230_000)).toBe(250_000);
  });

  it("uses evenly spaced marks", () => {
    expect(evenTicks(20)).toEqual([0, 5, 10, 15, 20]);
    expect(evenTicks(10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(evenTicks(250_000)).toEqual([0, 50_000, 100_000, 150_000, 200_000, 250_000]);
  });
});
