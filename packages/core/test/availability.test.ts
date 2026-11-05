import { describe, expect, it } from "vitest";
import {
  evaluateRallyAvailability,
  evaluateSpotAvailability,
  type SpotAvailability,
} from "../src/index.js";

describe("availability", () => {
  it("finds the next opening beyond a week of special closures", () => {
    const availability: SpotAvailability = {
      timezone: "UTC",
      weekly: [{ dayOfWeek: 1, hours: [{ opensAt: "09:00", closesAt: "17:00" }] }],
      exceptions: [
        { date: "2026-09-28", closed: true },
        { date: "2026-10-05", closed: true },
      ],
    };
    expect(
      evaluateSpotAvailability(availability, "2026-09-27T12:00:00Z").nextOpening,
    ).toMatchObject({ date: "2026-10-12", opensAt: "09:00" });
    expect(
      evaluateSpotAvailability(
        {
          timezone: "UTC",
          exceptions: [{ date: "2026-11-01", hours: [{ opensAt: "10:00", closesAt: "12:00" }] }],
        },
        "2026-09-27T12:00:00Z",
      ).nextOpening,
    ).toMatchObject({ date: "2026-11-01", opensAt: "10:00" });
  });
  it("uses the previous day's actual schedule for overnight hours", () => {
    const availability: SpotAvailability = {
      timezone: "UTC",
      weekly: [{ dayOfWeek: 0, hours: [{ opensAt: "22:00", closesAt: "02:00" }] }],
      exceptions: [{ date: "2026-09-26", hours: [{ opensAt: "23:00", closesAt: "03:00" }] }],
    };
    expect(evaluateSpotAvailability(availability, "2026-09-27T01:00:00Z").status).toBe("OPEN");
    expect(evaluateSpotAvailability(availability, "2026-09-27T04:00:00Z").status).toBe("CLOSED");
    expect(evaluateSpotAvailability(availability, "2026-09-28T01:00:00Z").status).toBe("OPEN");
  });
  it("evaluates rally start and end without reading the clock", () => {
    const availability = {
      startsAt: "2026-09-26T10:00:00+09:00",
      endsAt: "2026-09-26T18:00:00+09:00",
    };
    expect(evaluateRallyAvailability(availability, "2026-09-26T00:00:00Z").status).toBe("UPCOMING");
    expect(evaluateRallyAvailability(availability, "2026-09-26T02:00:00Z").status).toBe("OPEN");
    expect(evaluateRallyAvailability(availability, "2026-09-26T09:00:00Z").status).toBe("ENDED");
  });

  it("applies timezone, weekday hours, overnight hours, and closure exceptions", () => {
    const availability: SpotAvailability = {
      timezone: "Asia/Tokyo",
      weekly: [
        { dayOfWeek: 6, hours: [{ opensAt: "22:00", closesAt: "02:00" }] },
        { dayOfWeek: 0, hours: [{ opensAt: "09:00", closesAt: "17:00" }] },
      ],
      exceptions: [{ date: "2026-09-28", closed: true }],
    };
    expect(evaluateSpotAvailability(availability, "2026-09-26T14:00:00Z")).toMatchObject({
      status: "OPEN",
      currentPeriod: { opensAt: "22:00", closesAt: "02:00" },
    });
    expect(evaluateSpotAvailability(availability, "2026-09-26T16:59:00Z")).toMatchObject({
      status: "OPEN",
      currentPeriod: { opensAt: "22:00", closesAt: "02:00" },
    });
    expect(evaluateSpotAvailability(availability, "2026-09-26T03:00:00Z")).toMatchObject({
      status: "CLOSED",
      reason: "outside_schedule",
      nextOpening: {
        date: "2026-09-26",
        dayOfWeek: 6,
        opensAt: "22:00",
        closesAt: "02:00",
        isToday: true,
      },
    });
    expect(evaluateSpotAvailability(availability, "2026-09-28T02:00:00Z")).toMatchObject({
      status: "CLOSED",
      reason: "temporary_closure",
      nextOpening: {
        date: "2026-10-03",
        dayOfWeek: 6,
        opensAt: "22:00",
        closesAt: "02:00",
        isToday: false,
      },
    });
  });
});
