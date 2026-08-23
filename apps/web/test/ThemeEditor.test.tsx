import { DEFAULT_SHEET_THEME, type SheetTheme, THEME_PRESETS } from "@stamprally/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeEditor } from "../src/components/admin/ThemeEditor.js";

function preset(id: (typeof THEME_PRESETS)[number]["id"]) {
  const value = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (value === undefined) throw new Error(`Missing theme preset: ${id}`);
  return value;
}

describe("ThemeEditor presets", () => {
  it("replaces the complete theme when a preset card is selected", () => {
    const onChange = vi.fn<(theme: SheetTheme) => void>();
    const modernDark = preset("modern_dark");
    render(
      <ThemeEditor
        theme={{ ...DEFAULT_SHEET_THEME, backgroundImageUrl: "/previous-background.jpg" }}
        locale="ja"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "プリセット「モダンダーク」を適用" }));

    expect(onChange).toHaveBeenCalledWith({ ...modernDark.theme });
    expect(onChange.mock.calls[0]?.[0].backgroundImageUrl).toBeUndefined();
    expect(screen.getByText("「モダンダーク」を適用しました。")).toBeTruthy();
  });

  it("merges detailed overrides and marks a modified preset as custom", () => {
    const onChange = vi.fn<(theme: SheetTheme) => void>();
    const modernDark = preset("modern_dark");
    const { rerender } = render(
      <ThemeEditor theme={modernDark.theme} locale="ja" onChange={onChange} />,
    );

    expect(
      screen
        .getByRole("button", { name: "プリセット「モダンダーク」を適用" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText("グリッド列数"), { target: { value: "2" } });
    const overriddenTheme = { ...modernDark.theme, gridColumns: 2 };
    expect(onChange).toHaveBeenLastCalledWith(overriddenTheme);

    rerender(<ThemeEditor theme={overriddenTheme} locale="ja" onChange={onChange} />);
    expect(screen.getByText("現在の設定: カスタム")).toBeTruthy();
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.classList.contains("theme-preset-card"))
        .every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });

  it("renders localized names, descriptions, and controls", () => {
    render(<ThemeEditor theme={undefined} locale="en" onChange={() => undefined} />);

    expect(screen.getByText("Classic Blue")).toBeTruthy();
    expect(screen.getByText("Modern Dark")).toBeTruthy();
    expect(screen.getByText("Detailed customization")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply “Cyber Neon” preset" })).toBeTruthy();
  });
});
