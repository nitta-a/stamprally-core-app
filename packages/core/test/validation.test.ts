import { describe, expect, it } from "vitest";
import {
  parseAdminConfig,
  safeParseAdminConfig,
  safeParsePublicConfig,
  updateLocalizedField,
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
