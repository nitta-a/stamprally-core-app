import { describe, expect, it } from "vitest";
import { formatDateTimeLocal, parseDateTimeLocal } from "../src/availabilityDateTime.js";

describe("availability date-time timezone conversion", () => {
  it("formats and parses rally wall time in the configured timezone", () => {
    const timestamp = "2026-09-26T01:00:00.000Z";
    const local = formatDateTimeLocal(timestamp, "Asia/Tokyo");

    expect(local).toBe("2026-09-26T10:00");
    expect(parseDateTimeLocal(local, "Asia/Tokyo")).toBe(timestamp);
  });

  it("uses the entered timezone instead of the machine timezone", () => {
    expect(parseDateTimeLocal("2026-09-26T10:00", "America/Los_Angeles")).toBe(
      "2026-09-26T17:00:00.000Z",
    );
  });

  it("round-trips wall times on both sides of daylight-saving transitions", () => {
    for (const local of ["2026-03-08T01:30", "2026-03-08T03:30", "2026-11-01T01:30"]) {
      const timestamp = parseDateTimeLocal(local, "America/Los_Angeles");
      expect(timestamp).toBeDefined();
      expect(formatDateTimeLocal(timestamp ?? "", "America/Los_Angeles")).toBe(local);
    }
  });
});
