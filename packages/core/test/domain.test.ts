import { describe, expect, it } from "vitest";
import {
  type AdminRallyConfig,
  DEFAULT_SHEET_THEME,
  resolveLocalizedText,
  sanitizeAdminConfig,
  THEME_PRESETS,
  toLocalizedString,
  toPublicConfig,
  validatePublicConfigSafety,
} from "../src/index.js";

describe("localized values and themes", () => {
  it("resolves explicit and fallback locales without mutating source values", () => {
    expect(resolveLocalizedText({ ja: "日本語", en: "English" }, "en")).toBe("English");
    expect(resolveLocalizedText({ ja: "日本語" }, "en", "ja")).toBe("日本語");
    expect(resolveLocalizedText({ ja: "日本語" }, "en")).toBe("日本語");
    expect(resolveLocalizedText(undefined, "en")).toBe("");
    expect(toLocalizedString(undefined)).toEqual({ ja: "", en: "" });
    expect(toLocalizedString("Rally")).toEqual({ ja: "Rally", en: "" });
    expect(toLocalizedString({ en: "Rally" })).toEqual({ ja: "", en: "Rally" });
    expect(THEME_PRESETS).toHaveLength(5);
    expect(DEFAULT_SHEET_THEME.gridColumns).toBeGreaterThan(0);
  });
});

describe("public configuration transformation", () => {
  it("prefers public metadata and removes nested private values", () => {
    const config: AdminRallyConfig = {
      id: "rally",
      version: "1",
      title: "Rally",
      metadata: { old: true },
      publicMetadata: { visible: true },
      spots: [
        {
          id: "spot",
          orderIndex: 0,
          name: "Spot",
          conditions: [{ type: "passcode", code: "OPEN" }],
          metadata: { nested: { secretToken: "must-not-leak" } },
        },
      ],
      rewards: [
        {
          id: "reward",
          title: "Reward",
          type: "digital",
          redemptionMethod: "server_claim",
          requiredStampCount: 0,
          digitalContentUrl: "https://private.invalid",
        },
      ],
    };
    const publicConfig = toPublicConfig(config);
    expect(publicConfig.metadata).toEqual({ visible: true });
    expect(publicConfig.spots[0]?.conditions).toEqual([{ type: "passcode" }]);
    expect(validatePublicConfigSafety(publicConfig).safe).toBe(false);
    const sanitized = sanitizeAdminConfig(config);
    expect(sanitized.spots[0]?.metadata).toEqual({ nested: {} });
    expect(sanitized.rewards[0]).not.toHaveProperty("digitalContentUrl");
    expect(validatePublicConfigSafety(sanitized)).toEqual({ safe: true, leakedKeys: [] });
  });

  it("reports deeply nested private keys even when the object graph is cyclic", () => {
    const metadata: Record<string, unknown> = { secretToken: "leak" };
    metadata.self = metadata;
    const result = validatePublicConfigSafety({
      id: "rally",
      version: "1",
      title: "Rally",
      spots: [],
      rewards: [],
      metadata,
    });
    expect(result.safe).toBe(false);
    expect(result.leakedKeys).toContain("metadata.secretToken");
  });
});
