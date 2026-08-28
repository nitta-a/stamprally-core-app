import { describe, expect, it } from "vitest";
import {
  parseAdminConfig,
  safeParseAdminConfig,
  safeParsePublicConfig,
  updateLocalizedField,
  validateRallyConfigRelations,
} from "../src/index.js";

const validAdmin = {
  id: "rally",
  version: "1",
  title: { ja: "ラリー", en: "Rally" },
  spots: [
    {
      id: "spot-1",
      orderIndex: 0,
      name: { ja: "入口", en: "Entrance" },
      conditions: [
        { type: "passcode", code: "OPEN" },
        { type: "gps", latitude: 35.6, longitude: 139.7, radiusMeters: 50 },
      ],
    },
  ],
  rewards: [],
} as const;

describe("configuration parsing", () => {
  it("returns a typed value for valid admin configuration", () => {
    expect(parseAdminConfig(validAdmin).id).toBe("rally");
  });

  it("reports nested field paths", () => {
    const result = safeParseAdminConfig({
      ...validAdmin,
      spots: [{ ...validAdmin.spots[0], conditions: [{ type: "gps", latitude: 200 }] }],
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.errors.map((error) => error.path)).toContain(
        "spots[0].conditions[0].longitude",
      );
  });

  it("rejects private fields in public configuration", () => {
    const result = safeParsePublicConfig({ ...validAdmin, staffPasscode: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("private_field");
  });
});

describe("localized updates", () => {
  it("preserves other locale values immutably", () => {
    const current = { ja: "日本語", en: "English" } as const;
    const next = updateLocalizedField(current, "ja", "更新");
    expect(next).toEqual({ ja: "更新", en: "English" });
    expect(current).toEqual({ ja: "日本語", en: "English" });
  });
});

describe("configuration relationships", () => {
  it("filters duplicate IDs, missing prerequisites, duplicate order indexes, and reward references", () => {
    const errors = validateRallyConfigRelations({
      ...validAdmin,
      spots: [
        { ...validAdmin.spots[0], id: "duplicate", orderIndex: 0, prerequisites: ["missing"] },
        { ...validAdmin.spots[0], id: "duplicate", orderIndex: 0 },
      ],
      rewards: [
        {
          id: "reward",
          title: "Reward",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 0,
          conditions: [{ type: "stamps", stampIds: ["missing"] }],
        },
        {
          id: "reward",
          title: "Reward 2",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 0,
        },
      ],
    });
    expect(errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "duplicate_spot_id",
        "missing_prerequisite",
        "duplicate_order_index",
        "missing_reward_spot",
        "duplicate_reward_id",
      ]),
    );
  });

  it("detects prerequisite cycles", () => {
    const errors = validateRallyConfigRelations({
      ...validAdmin,
      spots: [
        { ...validAdmin.spots[0], id: "a", prerequisites: ["b"] },
        { ...validAdmin.spots[0], id: "b", prerequisites: ["a"], orderIndex: 1 },
      ],
    });
    expect(errors.some((error) => error.code === "cyclic_prerequisites")).toBe(true);
  });
});
