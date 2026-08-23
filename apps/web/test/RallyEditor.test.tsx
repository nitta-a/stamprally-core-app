import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RallyEditor } from "../src/components/admin/RallyEditor.js";
import { PUBLISHED_CONFIG_KEY } from "../src/configIO.js";

beforeEach(() => {
  window.localStorage.clear();
});

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`${label} was not rendered.`);
  return value;
}

describe("RallyEditor", () => {
  it("edits Japanese and English fields and exports LocalizedString JSON", async () => {
    let copiedJson = "";
    const writeText = vi.fn(async (source: string) => {
      copiedJson = source;
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<RallyEditor locale="ja" onLocaleChange={() => undefined} />);

    fireEvent.change(
      required(document.querySelector<HTMLInputElement>("#rally-title-ja"), "ja title"),
      {
        target: { value: "新しい東京ラリー" },
      },
    );
    fireEvent.change(
      required(document.querySelector<HTMLInputElement>("#rally-title-en"), "en title"),
      {
        target: { value: "New Tokyo Rally" },
      },
    );

    expect(screen.getByText("新しい東京ラリー")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "JSONをコピー" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const exported = JSON.parse(copiedJson) as {
      title: { ja: string; en: string };
    };
    expect(exported.title).toEqual({ ja: "新しい東京ラリー", en: "New Tokyo Rally" });
  });

  it("imports legacy string content, normalizes it, and publishes it", async () => {
    render(<RallyEditor locale="ja" onLocaleChange={() => undefined} />);
    const legacyConfig = {
      id: "legacy-demo",
      title: "旧ラリー",
      description: "旧形式の説明",
      isSequential: false,
      stamps: [
        {
          id: "legacy-spot",
          name: "旧スポット",
          description: "旧説明",
          condition: { type: "instant" },
        },
      ],
      rewards: [
        {
          id: "legacy-reward",
          title: "旧特典",
          description: "特典説明",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 1,
        },
      ],
    };
    fireEvent.change(screen.getByLabelText("JSON Import / Export"), {
      target: { value: JSON.stringify(legacyConfig) },
    });
    fireEvent.click(screen.getByRole("button", { name: "JSONを読み込む" }));

    expect(await screen.findByText("旧ラリー")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "デモへ反映" }));
    await waitFor(() => expect(window.localStorage.getItem(PUBLISHED_CONFIG_KEY)).not.toBeNull());
    const published = JSON.parse(window.localStorage.getItem(PUBLISHED_CONFIG_KEY) ?? "null") as {
      title: { ja: string; en: string };
      stamps: Array<{ name: { ja: string; en: string } }>;
    };
    expect(published.title).toEqual({ ja: "旧ラリー", en: "" });
    expect(published.stamps[0]?.name).toEqual({ ja: "旧スポット", en: "" });
  });

  it("adds a spot and edits recursively nested condition types", () => {
    render(<RallyEditor locale="ja" onLocaleChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "スポットを追加" }));

    const typeSelectors = screen.getAllByLabelText("Type");
    fireEvent.change(required(typeSelectors.at(-1), "spot condition"), {
      target: { value: "composite" },
    });
    expect(screen.getByRole("button", { name: "子条件を追加" })).toBeTruthy();

    const nestedSelectors = screen.getAllByLabelText("Type");
    fireEvent.change(required(nestedSelectors.at(-1), "nested condition"), {
      target: { value: "time_window" },
    });
    expect(screen.getByLabelText("開始日時")).toBeTruthy();
    expect(screen.getByLabelText("終了日時")).toBeTruthy();
  });
});
