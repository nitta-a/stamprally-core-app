import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHEET_THEME,
  exportProgressToken,
  InMemoryStorage,
  importProgressToken,
  type RallyConfig,
  resolveLocalizedText,
  StampRallyClient,
  toLocalizedString,
} from "../src/index.js";

const NOW = "2026-08-24T00:00:00.000Z";

describe("localized text", () => {
  it("resolves the requested locale and falls back to Japanese", () => {
    const text = { ja: "東京", en: "Tokyo" };
    expect(resolveLocalizedText(text, "en")).toBe("Tokyo");
    expect(resolveLocalizedText(text, "ja")).toBe("東京");
    expect(resolveLocalizedText({ ja: "東京", en: "" }, "en")).toBe("東京");
  });

  it("keeps legacy strings and safely handles missing values", () => {
    expect(resolveLocalizedText("Legacy title", "en")).toBe("Legacy title");
    expect(resolveLocalizedText(undefined, "ja")).toBe("");
    expect(toLocalizedString("従来値")).toEqual({ ja: "従来値", en: "" });
  });

  it("honors an explicit fallback locale", () => {
    expect(resolveLocalizedText({ ja: "", en: "English" }, "ja", "en")).toBe("English");
  });
});

describe("sheet theme", () => {
  it("exports the paper-inspired default theme", () => {
    expect(DEFAULT_SHEET_THEME).toEqual({
      primaryColor: "#9e551e",
      backgroundColor: "#fbf4df",
      cardBackgroundColor: "#fffdf5",
      textColor: "#352f25",
      slotShape: "rounded",
      gridColumns: 3,
      unclaimedOpacity: 1,
    });
  });

  it("accepts a theme without changing engine behavior", async () => {
    const config: RallyConfig = {
      id: "themed-rally",
      stamps: [{ id: "one", name: "One", condition: { type: "instant" } }],
      theme: {
        ...DEFAULT_SHEET_THEME,
        primaryColor: "#123456",
        slotShape: "circle",
        gridColumns: 1,
      },
    };
    const state = await new StampRallyClient(config, new InMemoryStorage(), () => NOW).init();
    expect(state.records).toEqual([]);
    expect(config.theme?.primaryColor).toBe("#123456");
  });
});

describe("localized rally compatibility", () => {
  it("keeps localized progress metadata in a recovery token", () => {
    const token = exportProgressToken({
      version: 1,
      rallyId: "東京ラリー",
      stamps: [
        { stampId: "東京駅", acquiredAt: NOW, metadata: { title: { ja: "東京", en: "Tokyo" } } },
      ],
      rewards: [],
      exportedAt: NOW,
    });
    expect(importProgressToken(token, "東京ラリー")?.stamps[0]?.metadata).toEqual({
      title: { ja: "東京", en: "Tokyo" },
    });
  });

  it("restores only unique stamp IDs still present in the published config", async () => {
    const config: RallyConfig = {
      id: "published-rally",
      title: { ja: "新しい台紙", en: "New sheet" },
      stamps: [
        { id: "kept", name: { ja: "継続", en: "Kept" }, condition: { type: "instant" } },
        { id: "new", name: { ja: "新規", en: "New" }, condition: { type: "instant" } },
      ],
    };
    const storage = new InMemoryStorage();
    await storage.save({
      rallyId: config.id,
      records: [
        { stampId: "kept", acquiredAt: NOW },
        { stampId: "kept", acquiredAt: NOW },
        { stampId: "removed", acquiredAt: NOW },
      ],
      updatedAt: NOW,
    });

    const state = await new StampRallyClient(config, storage, () => NOW).init();
    expect(state.records).toEqual([{ stampId: "kept", acquiredAt: NOW }]);
  });
});
