import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RallyViewer, RewardPanel, StampModal, StampSheet, StampSlot } from "../src/index.js";

const stamp = {
  id: "one",
  name: { ja: "一", en: "One" },
  condition: { type: "instant" as const },
};
const config = {
  id: "ui",
  stamps: [stamp],
};

afterEach(cleanup);

describe("participant UI", () => {
  it("connects a universal viewer to an adapter and exposes a live check-in dialog", async () => {
    const adapter = {
      config: {
        id: "viewer",
        version: "0.7.0",
        title: "Viewer",
        spots: [
          { id: "one", orderIndex: 0, name: "One", conditions: [{ type: "passcode" as const }] },
        ],
        rewards: [],
      },
      state: { rallyId: "viewer", records: [], updatedAt: "2026-08-28T00:00:00.000Z" },
      onCheckIn: vi.fn(async () => ({
        ok: true as const,
        value: {
          state: {
            rallyId: "viewer",
            records: [{ stampId: "one", acquiredAt: "2026-08-28T00:00:00.000Z" }],
            updatedAt: "2026-08-28T00:00:00.000Z",
          },
          record: { stampId: "one", acquiredAt: "2026-08-28T00:00:00.000Z" },
        },
      })),
      onClaimReward: vi.fn(),
    };
    render(<RallyViewer adapter={adapter} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: /One.*available/i }));
    fireEvent.change(screen.getByLabelText("Proof"), { target: { value: "code" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(adapter.onCheckIn).toHaveBeenCalledWith("one", "code");
  });

  it("renders accessible stamp slots and emits selection", () => {
    const onSelect = vi.fn();
    render(<StampSlot stamp={stamp} isNext={true} slotNumber={1} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /一.*available/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders a progress bar and grid", () => {
    render(<StampSheet config={config} title={{ ja: "台紙", en: "Sheet" }} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("button", { name: /一/i })).toBeTruthy();
  });

  it("renders live status and disabled ARIA state", () => {
    render(
      <StampSheet
        config={config}
        state={{
          rallyId: config.id,
          records: [{ stampId: "one", acquiredAt: "2026-08-23T12:00:00.000Z" }],
          updatedAt: "2026-08-23T12:00:00.000Z",
        }}
      />,
    );
    expect(screen.getAllByRole("status")[0]?.getAttribute("aria-live")).toBe("polite");
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-disabled")).toBe("false");

    render(<StampSlot stamp={stamp} disabled />);
    expect(screen.getAllByRole("button")[1]?.getAttribute("aria-disabled")).toBe("true");
  });

  it("closes modal panels with Escape and traps focus", () => {
    const onClose = vi.fn();
    render(
      <StampModal
        open
        stamp={stamp}
        onClose={onClose}
        onAcquire={async () => ({ ok: true, message: "claimed" })}
      />,
    );
    const closeButton = screen.getByRole("button", { name: "Close stamp details" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    const reward = {
      id: "reward",
      title: "Reward",
      description: "Description",
      type: "digital" as const,
      redemptionMethod: "manual_slide" as const,
      requiredStampCount: 0,
    };
    const rewardClose = vi.fn();
    render(
      <RewardPanel
        open
        rewards={[reward]}
        states={[{ rewardId: reward.id, status: "AVAILABLE" }]}
        onClose={rewardClose}
        onRedeem={async () => ({ ok: true, value: { rewardId: reward.id, status: "CONSUMED" } })}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(rewardClose).toHaveBeenCalledTimes(1);
  });

  it("adds the stamp press class and achievement status", () => {
    const { container } = render(
      <StampSlot
        stamp={stamp}
        record={{ stampId: stamp.id, acquiredAt: "2026-08-23T12:00:00.000Z" }}
        isAnimating
      />,
    );
    expect(container.querySelector(".stamp-press")).toBeTruthy();

    cleanup();
    render(
      <StampSheet
        config={config}
        progress={{
          acquired: 1,
          total: 1,
          percentage: 100,
          isCompleted: true,
          isComplete: true,
          nextAvailableStamps: [],
        }}
      />,
    );
    expect(screen.getByText("COMPLETE!!").className).toContain("stamp-sheet__complete-mark");
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
});
