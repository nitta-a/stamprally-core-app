import {
  calculateProgress,
  type RallyConfig,
  type StampDefinition,
  type StampRallyState,
} from "@stamprally/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StampSheet } from "../src/components/StampSheet.js";
import { type StampPresentation, StampSlot } from "../src/components/StampSlot.js";

const firstStamp: StampDefinition = {
  id: "one",
  name: "First Stop",
  order: 1,
  condition: { type: "instant" },
};
const firstPresentation: StampPresentation = {
  channel: "instant",
  label: "Instant",
  icon: "⚡",
  ink: "vermilion",
};

const config: RallyConfig = {
  id: "sheet-test",
  isSequential: true,
  stamps: [
    firstStamp,
    {
      id: "two",
      name: "Second Stop",
      order: 2,
      condition: { type: "token", token: "TWO" },
    },
  ],
};

const presentations: Readonly<Record<string, StampPresentation>> = {
  one: firstPresentation,
  two: { channel: "qr", label: "QR Code", icon: "📷", ink: "indigo" },
};

function state(records: StampRallyState["records"]): StampRallyState {
  return { rallyId: config.id, records, updatedAt: "2026-01-02T03:04:00.000Z" };
}

describe("StampSlot", () => {
  it("renders available, locked, and stamped visual states", () => {
    const acquiredAt = new Date(2026, 0, 2, 3, 4).toISOString();
    const onSelect = vi.fn();
    const { rerender } = render(
      <StampSlot
        stamp={firstStamp}
        record={undefined}
        isNext={true}
        slotNumber={1}
        presentation={firstPresentation}
        isAnimating={false}
        disabled={false}
        onSelect={onSelect}
      />,
    );

    const available = screen.getByRole("button", { name: /#01 First Stop、取得可能/ });
    expect(available.classList.contains("stamp-slot--available")).toBe(true);
    fireEvent.click(available);
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(
      <StampSlot
        stamp={firstStamp}
        record={undefined}
        isNext={false}
        slotNumber={1}
        presentation={firstPresentation}
        isAnimating={false}
        disabled={false}
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByRole("button", { name: /順序待ち/ }).classList.contains("stamp-slot--locked"),
    ).toBe(true);

    rerender(
      <StampSlot
        stamp={firstStamp}
        record={{ stampId: "one", acquiredAt }}
        isNext={false}
        slotNumber={1}
        presentation={firstPresentation}
        isAnimating={true}
        disabled={false}
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByRole("button", { name: /取得済み/ }).classList.contains("stamp-slot--stamped"),
    ).toBe(true);
    expect(screen.getByRole("img", { name: /取得日時/ }).classList.contains("stamp-press")).toBe(
      true,
    );
    expect(screen.getByText("2026-01-02 03:04")).toBeTruthy();
  });
});

describe("StampSheet", () => {
  it("renders sequential availability and forwards selected IDs", () => {
    const current = state([]);
    const onStampSelect = vi.fn();
    render(
      <StampSheet
        title="TEST RALLY"
        config={config}
        state={current}
        progress={calculateProgress(current, config)}
        presentations={presentations}
        animatedStampId={null}
        disabled={false}
        onStampSelect={onStampSelect}
      />,
    );

    expect(screen.getByText("0 / 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: /First Stop、取得可能/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Second Stop、順序待ち/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Second Stop/ }));
    expect(onStampSelect).toHaveBeenCalledWith("two");
  });

  it("shows completion only when every configured stamp is acquired", () => {
    const completed = state([
      { stampId: "one", acquiredAt: "2026-01-01T00:00:00.000Z" },
      { stampId: "two", acquiredAt: "2026-01-02T00:00:00.000Z" },
    ]);
    render(
      <StampSheet
        title="TEST RALLY"
        config={config}
        state={completed}
        progress={calculateProgress(completed, config)}
        presentations={presentations}
        animatedStampId={null}
        disabled={false}
        onStampSelect={() => undefined}
      />,
    );

    expect(screen.getByText("COMPLETE!!")).toBeTruthy();
    expect(screen.getByText("ラリー達成")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("resolves localized spot names and system guidance when locale changes", () => {
    const localizedConfig: RallyConfig = {
      ...config,
      title: { ja: "テストラリー", en: "Test Rally" },
      stamps: [
        {
          ...firstStamp,
          name: { ja: "最初の場所", en: "First Place" },
        },
      ],
    };
    const current = {
      rallyId: localizedConfig.id,
      records: [],
      updatedAt: "2026-01-02T03:04:00.000Z",
    };
    const { rerender } = render(
      <StampSheet
        title={localizedConfig.title ?? localizedConfig.id}
        config={localizedConfig}
        state={current}
        progress={calculateProgress(current, localizedConfig)}
        presentations={{ one: firstPresentation }}
        animatedStampId={null}
        disabled={false}
        locale="ja"
        onStampSelect={() => undefined}
      />,
    );

    expect(screen.getByText("テストラリー")).toBeTruthy();
    expect(screen.getByText("最初の場所")).toBeTruthy();
    expect(screen.getByText("あと1箇所")).toBeTruthy();

    rerender(
      <StampSheet
        title={localizedConfig.title ?? localizedConfig.id}
        config={localizedConfig}
        state={current}
        progress={calculateProgress(current, localizedConfig)}
        presentations={{ one: firstPresentation }}
        animatedStampId={null}
        disabled={false}
        locale="en"
        onStampSelect={() => undefined}
      />,
    );
    expect(screen.getByText("Test Rally")).toBeTruthy();
    expect(screen.getByText("First Place")).toBeTruthy();
    expect(screen.getByText("1 spots remaining")).toBeTruthy();
  });

  it("binds a custom theme to CSS variables and slot shape classes", () => {
    const themedConfig: RallyConfig = {
      ...config,
      theme: {
        primaryColor: "#123456",
        backgroundColor: "#f0f1f2",
        backgroundImageUrl: "https://example.com/sheet.jpg",
        cardBackgroundColor: "#abcdef",
        textColor: "#111111",
        slotShape: "circle",
        gridColumns: 4,
        unclaimedOpacity: 0.45,
        completedStampColor: "#654321",
        fontFamily: "monospace",
      },
    };
    const current = state([]);
    const { container } = render(
      <StampSheet
        title="THEMED RALLY"
        config={themedConfig}
        state={current}
        progress={calculateProgress(current, themedConfig)}
        presentations={presentations}
        animatedStampId={null}
        disabled={false}
        onStampSelect={() => undefined}
      />,
    );
    const sheet = requiredElement(container.querySelector<HTMLElement>(".stamp-sheet"));
    expect(sheet.style.getPropertyValue("--stamp-primary")).toBe("#123456");
    expect(sheet.style.getPropertyValue("--stamp-bg")).toBe("#f0f1f2");
    expect(sheet.style.getPropertyValue("--stamp-card-bg")).toBe("#abcdef");
    expect(sheet.style.getPropertyValue("--stamp-text")).toBe("#111111");
    expect(sheet.style.getPropertyValue("--stamp-grid-cols")).toBe("4");
    expect(sheet.style.getPropertyValue("--stamp-grid-cols-mobile")).toBe("2");
    expect(sheet.style.getPropertyValue("--stamp-unclaimed-opacity")).toBe("0.45");
    expect(sheet.style.getPropertyValue("--stamp-completed-color")).toBe("#654321");
    expect(sheet.style.getPropertyValue("--stamp-font-family")).toContain("ui-monospace");
    expect(sheet.style.getPropertyValue("--stamp-background-image")).toContain(
      "https://example.com/sheet.jpg",
    );
    expect(container.querySelectorAll(".stamp-slot--shape-circle")).toHaveLength(2);
  });

  it("uses the default theme and preserves presentation ink when theme is omitted", () => {
    const current = state([]);
    const { container } = render(
      <StampSheet
        title="DEFAULT RALLY"
        config={config}
        state={current}
        progress={calculateProgress(current, config)}
        presentations={presentations}
        animatedStampId={null}
        disabled={false}
        onStampSelect={() => undefined}
      />,
    );
    const sheet = requiredElement(container.querySelector<HTMLElement>(".stamp-sheet"));
    expect(sheet.style.getPropertyValue("--stamp-grid-cols")).toBe("3");
    expect(sheet.style.getPropertyValue("--stamp-completed-color")).toBe("");
    expect(sheet.style.getPropertyValue("--stamp-font-family")).toContain("Georgia");
    expect(container.querySelectorAll(".stamp-slot--shape-rounded")).toHaveLength(2);
  });
});

function requiredElement<T>(value: T | null): T {
  if (value === null) throw new Error("Expected element was not rendered.");
  return value;
}
