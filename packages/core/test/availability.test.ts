import { describe, expect, it } from "vitest";
import {
  evaluateRallyAvailability,
  evaluateSpotAvailability,
  type SpotAvailability,
} from "../src/index.js";

describe("availability", () => {
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
    expect(evaluateSpotAvailability(availability, "2026-09-26T14:00:00Z").status).toBe("OPEN");
    expect(evaluateSpotAvailability(availability, "2026-09-26T16:59:00Z").status).toBe("OPEN");
    expect(evaluateSpotAvailability(availability, "2026-09-28T02:00:00Z").status).toBe("CLOSED");
  });
});
