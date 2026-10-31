import type { AdminRallyConfig } from "@stamprally/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("supports undo/redo, spot reordering/duplication, prerequisite checkboxes, and preflight issue jump", () => {
    render(<EditorFixture />);

    const titleInput = screen.getByLabelText("ラリーの名前") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "変更後のラリー名" } });
    expect(titleInput.value).toBe("変更後のラリー名");

    const undoButton = screen.getByRole("button", { name: "元に戻す" });
    const redoButton = screen.getByRole("button", { name: "やり直す" });
    expect(undoButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(undoButton);
    expect((screen.getByLabelText("ラリーの名前") as HTMLInputElement).value).toBe(
      "こもれび街歩きラリー",
    );
    expect(redoButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(redoButton);
    expect((screen.getByLabelText("ラリーの名前") as HTMLInputElement).value).toBe(
      "変更後のラリー名",
    );

    fireEvent.click(screen.getByRole("tab", { name: "スポット" }));
    const parkSummary = screen.getByText("川沿いの遊歩道", { selector: "strong" });
    const parkDetails = parkSummary.closest("details");
    if (parkDetails === null) throw new Error("Expected park details.");
    const prerequisiteCheckbox = within(parkDetails).getByRole("checkbox", {
      name: "こもれび案内所",
    }) as HTMLInputElement;
    expect(prerequisiteCheckbox.checked).toBe(true);
    fireEvent.click(prerequisiteCheckbox);
    expect(prerequisiteCheckbox.checked).toBe(false);

    fireEvent.click(within(parkDetails).getByRole("button", { name: "↑ 上へ移動" }));
    const headings = screen
      .getAllByText(/こもれび案内所|川沿いの遊歩道/, { selector: "strong" })
      .map((node) => node.textContent);
    expect(headings.slice(0, 2)).toEqual(["川沿いの遊歩道", "こもれび案内所"]);

    fireEvent.click(within(parkDetails).getByRole("button", { name: "スポットを複製" }));
    expect(screen.getAllByText("川沿いの遊歩道", { selector: "strong" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("tab", { name: "基本情報" }));
    fireEvent.change(screen.getByLabelText("達成するには"), {
      target: { value: "stamp_count" },
    });
    fireEvent.change(screen.getByLabelText("達成に必要なスタンプ数"), {
      target: { value: "99" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "詳細設定" }));
    const issueButton = screen.getByRole("button", {
      name: /現在のスポット構成では、ラリーの達成条件を満たせません。/,
    });
    fireEvent.click(issueButton);
    expect(screen.getByRole("tab", { name: "基本情報" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });
});
