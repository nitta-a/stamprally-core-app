import type { AdminRallyConfig } from "@stamprally/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminExperience } from "../src/AdminExperience.js";
import { DEFAULT_ADMIN_CONFIG } from "../src/demoConfig.js";

function EditorFixture(): ReactElement {
  const [config, setConfig] = useState<AdminRallyConfig>(DEFAULT_ADMIN_CONFIG);
  return <AdminExperience config={config} onChange={setConfig} />;
}

describe("organizer experience", () => {
  it("edits the shared configuration and updates the rally summary", () => {
    const onChange = vi.fn();
    render(<AdminExperience config={DEFAULT_ADMIN_CONFIG} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("ラリーの名前"), { target: { value: "秋の街歩き" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.objectContaining({ ja: "秋の街歩き" }) }),
    );
    expect(screen.getByText(/このブラウザーのプレビュー設定です/)).toBeTruthy();
  });

  it("supports keyboard navigation and adding spots and rewards", () => {
    render(<EditorFixture />);
    const generalTab = screen.getByRole("tab", { name: "基本情報" });
    generalTab.focus();
    fireEvent.keyDown(generalTab, { key: "ArrowRight" });

    const spotsTab = screen.getByRole("tab", { name: "スポット" });
    expect(spotsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(spotsTab);
    fireEvent.click(screen.getByRole("button", { name: "＋ スポットを追加" }));
    expect(screen.getByText("新しいスポット", { selector: "strong" })).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("新しいスポット"), {
      target: { value: "商店街の案内所" },
    });
    expect(screen.getByText("商店街の案内所", { selector: "strong" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "特典" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 特典を追加" }));
    expect(screen.getByText("新しい特典", { selector: "strong" })).toBeTruthy();
    expect(
      screen.getByText(`スタンプ ${DEFAULT_ADMIN_CONFIG.spots.length + 1} 個で達成`),
    ).toBeTruthy();
  });

  it("reports an unreachable completion condition in Japanese", () => {
    const config: AdminRallyConfig = {
      ...DEFAULT_ADMIN_CONFIG,
      completion: { condition: { type: "stamp_count", count: 99 } },
    };
    render(<AdminExperience config={config} onChange={vi.fn()} />);

    expect(
      screen.getByText("現在のスポット構成では、ラリーの達成条件を満たせません。"),
    ).toBeTruthy();
  });

  it("imports validated settings and rejects malformed JSON", () => {
    const onChange = vi.fn();
    render(<AdminExperience config={DEFAULT_ADMIN_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "詳細設定" }));
    const importDetails = screen.getByText("JSONから設定を読み込む");
    fireEvent.click(importDetails);
    fireEvent.change(screen.getByLabelText("管理用設定JSON"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "この設定を読み込む" }));
    expect(screen.getByRole("alert").textContent).toContain("JSONの形式を確認してください。");
    expect(onChange).not.toHaveBeenCalled();

    const config = { ...DEFAULT_ADMIN_CONFIG, title: "読み込み済みのラリー" };
    fireEvent.change(screen.getByLabelText("管理用設定JSON"), {
      target: { value: JSON.stringify(config) },
    });
    fireEvent.click(screen.getByRole("button", { name: "この設定を読み込む" }));
    expect(onChange).toHaveBeenCalledWith(config);
  });
});
