import type { RallyConfig } from "@stamprally/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QrExportModal } from "../src/components/admin/QrExportModal.js";

const config: RallyConfig = {
  id: "print-rally",
  title: { ja: "印刷ラリー", en: "Print Rally" },
  stamps: [
    {
      id: "token-spot",
      name: { ja: "受付", en: "Reception" },
      condition: { type: "token", token: "WELCOME-2026" },
    },
    {
      id: "instant-spot",
      name: { ja: "広場", en: "Plaza" },
      condition: { type: "instant" },
    },
  ],
};

describe("QrExportModal", () => {
  it("renders printable QR cards and passcodes for every spot", async () => {
    const onClose = vi.fn();
    const print = vi.fn();
    Object.defineProperty(window, "print", { configurable: true, value: print });
    render(<QrExportModal open config={config} locale="ja" onClose={onClose} />);

    expect(await screen.findByRole("dialog", { name: "チェックインPOP一括出力" })).toBeTruthy();
    expect(screen.getByText("WELCOME-2026")).toBeTruthy();
    expect(screen.getByText("合言葉なし")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    for (const image of screen.getAllByRole<HTMLImageElement>("img")) {
      expect(image.src).toContain("data:image/svg+xml");
    }

    fireEvent.click(screen.getByRole("button", { name: "このPOPを印刷" }));
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders localized spot names and labels", async () => {
    render(<QrExportModal open config={config} locale="en" onClose={() => undefined} />);

    expect(await screen.findByText("Reception")).toBeTruthy();
    expect(screen.getByText("Plaza")).toBeTruthy();
    expect(screen.getAllByText("Print Rally")).toHaveLength(2);
    expect(screen.getByText("No passcode")).toBeTruthy();
  });
});
