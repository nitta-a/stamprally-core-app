import { describe, expect, it } from "vitest";
import type { AdminRallyConfig, PublicRallyConfig } from "../src/index.js";
import {
  createMockRallyAdapter,
  resolvePreferredLocale,
  validateLocalizationCompleteness,
} from "../src/index.js";

describe("inbound and developer kit features", () => {
  it("resolves exact and parent locales in user preference order", () => {
    expect(resolvePreferredLocale(["en", "zh", "ja"], "en", ["zh-TW", "ja-JP"])).toBe("zh");
    expect(resolvePreferredLocale(["en", "ja"], "en", ["fr-FR", "ja-JP"])).toBe("ja");
    expect(resolvePreferredLocale(["en", "ja"], "en", ["fr-FR"])).toBe("en");
  });

  it("reports missing spot translations without mutating the config", () => {
    const config = {
      id: "rally",
      version: "1",
      title: { en: "Rally", ja: "ラリー" },
      spots: [
        {
          id: "spot",
          orderIndex: 0,
          name: { en: "Spot" },
          description: { en: "Description" },
          conditions: [],
        },
      ],
      rewards: [],
    } satisfies AdminRallyConfig;
    const warnings = validateLocalizationCompleteness(config, ["en", "ja"]);
    expect(warnings.map((warning) => warning.path)).toEqual([
      "spots[0].name.ja",
      "spots[0].description.ja",
    ]);
  });

  it("provides an in-memory adapter with initial progress and local transitions", async () => {
    const config = {
      id: "rally",
      version: "1",
      title: "Rally",
      spots: [{ id: "spot", orderIndex: 0, name: "Spot", conditions: [] }],
      rewards: [],
    } satisfies PublicRallyConfig;
    const adapter = createMockRallyAdapter(config, { initialStamps: [] });
    expect(adapter.state.records).toHaveLength(0);
    const result = await adapter.onCheckIn("spot", undefined);
    expect(result.ok).toBe(true);
    expect(adapter.state.records.map((record) => record.stampId)).toEqual(["spot"]);
  });
});
