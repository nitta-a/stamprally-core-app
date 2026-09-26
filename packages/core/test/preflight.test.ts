import { describe, expect, it } from "vitest";
import {
  analyzeRallyExperience,
  type PublicRallyConfig,
  simulateRallyProgression,
} from "../src/index.js";

const config: PublicRallyConfig = {
  id: "rally",
  version: "1",
  title: "Rally",
  spots: [
    {
      id: "a",
      orderIndex: 0,
      name: { en: "A" },
      conditions: [{ type: "gps", latitude: 35, longitude: 139, radiusMeters: 20 }],
      prerequisites: ["b"],
    },
    {
      id: "b",
      orderIndex: 1,
      name: "B",
      conditions: [{ type: "nfc" }],
      prerequisites: ["a"],
      availability: { weekly: [] },
    },
  ],
  rewards: [
    {
      id: "prize",
      title: "Prize",
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: 2,
    },
  ],
};

describe("experience preflight", () => {
  it("reports unreachable cycles and impossible rewards, and simulates reachable spots", () => {
    const simulation = simulateRallyProgression(config);
    expect(simulation.reachableSpotIds).toEqual([]);
    expect(simulation.unlockedRewardIds).toEqual([]);
    const codes = analyzeRallyExperience(config, { targetLocales: ["ja"] }).map(({ code }) => code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "unreachable_spots",
        "prerequisite_cycle",
        "impossible_completion",
        "impossible_reward",
        "gps_without_location",
        "limited_checkin_fallback",
        "spot_never_open",
        "missing_localization",
      ]),
    );
  });

  it("detects required spots that never open during the bounded rally period", () => {
    const boundedConfig: PublicRallyConfig = {
      ...config,
      spots: [
        {
          id: "required",
          orderIndex: 0,
          name: "Required",
          conditions: [{ type: "qr", qrEntryUrl: "https://example.test/check-in" }],
          availability: {
            timezone: "UTC",
            weekly: [{ dayOfWeek: 2, hours: [{ opensAt: "09:00", closesAt: "17:00" }] }],
          },
        },
      ],
      rewards: [
        {
          id: "period-prize",
          title: "Period prize",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 1,
          conditions: [{ type: "stamps", stampIds: ["required"] }],
        },
      ],
      availability: {
        startsAt: "2026-09-28T00:00:00Z",
        endsAt: "2026-09-29T00:00:00Z",
      },
    };

    const issues = analyzeRallyExperience(boundedConfig);
    expect(issues.map(({ code }) => code)).toContain("availability_blocked_spots");
    expect(issues.map(({ code }) => code)).toContain("completion_availability_conflict");
    expect(issues.map(({ code }) => code)).toContain("reward_availability_conflict");
  });
});
