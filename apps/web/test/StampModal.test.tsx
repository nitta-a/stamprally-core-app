import type { StampDefinition } from "@stamprally/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StampModal } from "../src/components/StampModal.js";
import type { StampPresentation } from "../src/components/StampSlot.js";

const instant: StampDefinition = {
  id: "instant",
  name: "Instant Stop",
  condition: { type: "instant" },
};
const token: StampDefinition = {
  id: "token",
  name: "Token Stop",
  condition: { type: "token", token: "CORRECT" },
};
const geo: StampDefinition = {
  id: "geo",
  name: "Geo Stop",
  condition: { type: "geo", latitude: 35, longitude: 139, radiusMeters: 100 },
};
const instantPresentation: StampPresentation = {
  channel: "instant",
  label: "Instant",
  icon: "⚡",
  ink: "vermilion",
};
const qrPresentation: StampPresentation = {
  channel: "qr",
  label: "QR Code",
  icon: "📷",
  ink: "indigo",
};
const nfcPresentation: StampPresentation = {
  channel: "nfc",
  label: "Web NFC",
  icon: "📳",
  ink: "vermilion",
};
const geoPresentation: StampPresentation = {
  channel: "geo",
  label: "GPS",
  icon: "📍",
  ink: "indigo",
};

function renderModal(
  stamp: StampDefinition,
  presentation: StampPresentation,
  options: { readonly isAvailable?: boolean; readonly isPending?: boolean } = {},
) {
  const onAcquire = vi.fn(async () => ({ ok: true, message: "取得しました" }));
  const onClose = vi.fn();
  const onNotify = vi.fn();
  render(
    <StampModal
      open={true}
      stamp={stamp}
      record={undefined}
      presentation={presentation}
      isAvailable={options.isAvailable ?? true}
      requiredStampName="Required Stop"
      isPending={options.isPending ?? false}
      onClose={onClose}
      onAcquire={onAcquire}
      onNotify={onNotify}
    />,
  );
  return { onAcquire, onClose, onNotify };
}

describe("StampModal", () => {
  it("opens a native dialog and dispatches an instant context", async () => {
    const { onAcquire, onClose } = renderModal(instant, instantPresentation);
    expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "スタンプを押す" }));
    await waitFor(() => expect(onAcquire).toHaveBeenCalledWith("instant", { type: "instant" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps locked details visible but disables acquisition", () => {
    renderModal(instant, instantPresentation, { isAvailable: false });
    expect(screen.getByText(/先に「Required Stop」/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "スタンプを押す" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("supports manual QR and NFC token flows", async () => {
    const qr = renderModal(token, qrPresentation);
    fireEvent.click(screen.getByRole("tab", { name: "手入力" }));
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: "MANUAL" } });
    fireEvent.click(screen.getByRole("button", { name: "入力値で押印" }));
    await waitFor(() =>
      expect(qr.onAcquire).toHaveBeenCalledWith("token", { type: "token", token: "MANUAL" }),
    );

    cleanup();
    const nfc = renderModal(token, nfcPresentation);
    expect(screen.getByRole("tab", { name: "Web NFC" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "手入力" }));
    fireEvent.click(screen.getByRole("button", { name: "正解トークンを模擬" }));
    await waitFor(() =>
      expect(nfc.onAcquire).toHaveBeenCalledWith("token", {
        type: "token",
        token: "CORRECT",
      }),
    );
  });

  it("creates a geo context from the success preset", async () => {
    const { onAcquire } = renderModal(geo, geoPresentation);
    fireEvent.click(screen.getByRole("button", { name: "成功プリセット" }));
    fireEvent.click(screen.getByRole("button", { name: "入力座標で押印" }));
    await waitFor(() =>
      expect(onAcquire).toHaveBeenCalledWith("geo", {
        type: "geo",
        currentLatitude: 35,
        currentLongitude: 139,
      }),
    );
  });

  it("aborts an active NFC scan when the dialog closes", async () => {
    let scanSignal: AbortSignal | undefined;
    class MockNdefReader {
      onreading: ((event: Event) => void) | null = null;
      onreadingerror: ((event: Event) => void) | null = null;
      scan(options?: { readonly signal?: AbortSignal }): Promise<void> {
        scanSignal = options?.signal;
        return new Promise(() => undefined);
      }
    }
    vi.stubGlobal("NDEFReader", MockNdefReader);
    const { onClose } = renderModal(token, nfcPresentation);
    fireEvent.click(screen.getByRole("button", { name: "NFCタグをスキャン" }));
    await waitFor(() => expect(scanSignal).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "スタンプ詳細を閉じる" }));
    expect(scanSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close while an acquisition is pending", () => {
    const { onClose } = renderModal(instant, instantPresentation, { isPending: true });
    expect(
      (screen.getByRole("button", { name: "スタンプ詳細を閉じる" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
