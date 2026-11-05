import type { PublicRallyConfig, StampRallyState } from "@stamprally/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MuiAdminRallyEditor,
  CompletionPanel as MuiCompletionPanel,
  MuiMetadataEditor,
  type MuiRallyAdapter,
  MuiRallyViewer,
  MuiRewardCard,
  MuiStaffRedemptionView,
} from "../src/index.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const config: PublicRallyConfig = {
  id: "rally",
  version: "1",
  title: "MUI Rally",
  spots: [
    { id: "first", orderIndex: 0, name: "First spot", conditions: [] },
    { id: "locked", orderIndex: 1, name: "Locked spot", prerequisites: ["first"], conditions: [] },
  ],
  rewards: [
    {
      id: "reward",
      title: "Coffee",
      type: "in_person",
      redemptionMethod: "manual_slide",
      requiredStampCount: 1,
      stockLimit: 3,
    },
  ],
};

const state: StampRallyState = {
  rallyId: "rally",
  userId: null,
  records: [],
  rewards: [{ rewardId: "reward", status: "AVAILABLE" }],
  updatedAt: "",
};

function adapter(overrides: Partial<MuiRallyAdapter> = {}): MuiRallyAdapter {
  return {
    config,
    state,
    isLoading: false,
    error: null,
    onCheckIn: vi.fn(async () => ({
      ok: true as const,
      value: { state, record: { stampId: "first", acquiredAt: "" } },
    })),
    onClaimReward: vi.fn(async () => ({
      ok: true as const,
      value: { state, reward: { rewardId: "reward", status: "CONSUMED" as const } },
    })),
    onSync: vi.fn(async () => undefined),
    syncState: {
      isSyncing: false,
      pendingCount: 0,
      rejectedHistory: [],
      storageCapability: "memory",
      isStoragePersistent: false,
      queueCapabilities: {
        storageType: "memory",
        isPersistent: false,
        multiTabSync: "disabled_unsafe_environment",
      },
    },
    ...overrides,
  };
}

describe("MuiRallyViewer", () => {
  it("prevents duplicate check-ins while an adapter is pending", async () => {
    let finish: (() => void) | undefined;
    const onCheckIn = vi.fn(
      () =>
        new Promise<{
          ok: false;
          error: { code: "INVALID_PROOF"; spotId: string; message: string };
        }>((resolve) => {
          finish = () =>
            resolve({
              ok: false,
              error: { code: "INVALID_PROOF", spotId: "first", message: "Wrong" },
            });
        }),
    );
    const current = adapter({ onCheckIn });
    render(<MuiRallyViewer adapter={current} />);
    const button = screen.getByRole("button", { name: "Check in" });
    fireEvent.click(button);
    expect(onCheckIn).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(onCheckIn).toHaveBeenCalledTimes(1);
    finish?.();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
  it("does not offer a sold-out reward on completion", () => {
    const progress = {
      acquired: 1,
      total: 1,
      percentage: 100,
      isCompleted: true,
      completionRequired: 1,
      completionAcquired: 1,
      completionPercentage: 100,
      nextAvailableSpots: [],
    };
    const reward = config.rewards[0];
    if (reward === undefined) throw new Error("Expected reward.");
    render(
      <MuiCompletionPanel
        locale="en"
        progress={progress}
        rewards={[reward]}
        rewardStates={[{ rewardId: reward.id, status: "AVAILABLE" }]}
        inventory={{ rewardRemaining: { [reward.id]: 0 } }}
        onClaimReward={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Redeem" })).toBeNull();
  });
  it("requires confirmation before redeeming from completion", async () => {
    const onClaimReward = vi.fn(async () => ({ ok: true }));
    const progress = {
      acquired: 1,
      total: 1,
      percentage: 100,
      isCompleted: true,
      completionRequired: 1,
      completionAcquired: 1,
      completionPercentage: 100,
      nextAvailableSpots: [],
    };
    const reward = config.rewards[0];
    if (reward === undefined) throw new Error("Expected reward.");
    render(
      <MuiCompletionPanel
        locale="en"
        progress={progress}
        rewards={[reward]}
        rewardStates={[{ rewardId: reward.id, status: "AVAILABLE" }]}
        onClaimReward={onClaimReward}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClaimReward).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Redeem" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onClaimReward).toHaveBeenCalledOnce());
  });
  it("sends the staff passcode from reward card and completion dialogs", async () => {
    const onClaim = vi.fn().mockResolvedValue({ ok: true });
    const reward = {
      id: "staff",
      title: "Staff prize",
      type: "in_person" as const,
      redemptionMethod: "staff_passcode" as const,
      requiredStampCount: 1,
    };
    const progress = {
      acquired: 1,
      total: 1,
      percentage: 100,
      isCompleted: true,
      completionRequired: 1,
      completionAcquired: 1,
      completionPercentage: 100,
      nextAvailableSpots: [],
    };
    const { unmount } = render(
      <MuiRewardCard
        reward={reward}
        state={{ rewardId: reward.id, status: "AVAILABLE" }}
        locale="en"
        onClaim={onClaim}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Staff passcode"), { target: { value: " CODE " } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith("staff", { staffPasscode: "CODE" }));
    unmount();
    render(
      <MuiCompletionPanel
        locale="en"
        progress={progress}
        rewards={[reward]}
        rewardStates={[{ rewardId: reward.id, status: "AVAILABLE" }]}
        onClaimReward={onClaim}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    fireEvent.change(screen.getByLabelText("Staff passcode"), { target: { value: "NEXT" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(onClaim).toHaveBeenLastCalledWith("staff", { staffPasscode: "NEXT" }),
    );
  });
  it("requires confirmation before staff redeem a ticket", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const onRedeem = vi.fn(async () => ({ ok: true }));
    render(<MuiStaffRedemptionView onRedeem={onRedeem} locale="en" />);
    fireEvent.change(screen.getByLabelText("Ticket number or QR value"), {
      target: { value: "T-1" },
    });
    fireEvent.change(screen.getByLabelText("Staff passcode"), { target: { value: "CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "Redeem ticket" }));
    expect(onRedeem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Redeem ticket" }));
    await waitFor(() => expect(onRedeem).toHaveBeenCalledTimes(1));
  });
  it("accepts a configured passcode and reports a failed attempt", async () => {
    const current = adapter({
      config: {
        ...config,
        spots: [
          { id: "first", orderIndex: 0, name: "First spot", conditions: [{ type: "passcode" }] },
        ],
      },
      onCheckIn: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          error: { code: "INVALID_PROOF", message: "Wrong code" },
        })
        .mockResolvedValueOnce({
          ok: true,
          value: {
            state: { ...state, records: [{ stampId: "first", acquiredAt: "" }] },
            record: { stampId: "first", acquiredAt: "" },
          },
        }),
    });
    render(<MuiRallyViewer adapter={current} locale="ja" />);
    const card = screen.getByRole("heading", { name: "First spot" }).closest("div.MuiCard-root");
    if (!(card instanceof HTMLElement)) throw new Error("Expected spot card.");
    fireEvent.change(within(card).getByRole("textbox", { name: "合言葉" }), {
      target: { value: "WRONG" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "チェックイン" }));
    expect((await within(card).findByRole("alert")).textContent).toContain("入力内容を確認");
    fireEvent.change(within(card).getByRole("textbox", { name: "合言葉" }), {
      target: { value: "OPEN" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "チェックイン" }));
    await waitFor(() => expect(current.onCheckIn).toHaveBeenLastCalledWith("first", "OPEN"));
    expect(await screen.findByText(/First spotのスタンプを獲得/)).toBeTruthy();
  });
  it("resolves built-in Japanese labels and keeps reward viewing separate from claiming", () => {
    const current = adapter({
      config: {
        ...config,
        completion: { condition: { type: "stamp_count", count: 1 } },
        rewards: config.rewards.map((reward) => ({
          ...reward,
          redemptionMethod: "view_only" as const,
        })),
      },
      state: { ...state, records: [{ stampId: "first", acquiredAt: "" }] },
    });
    const onViewReward = vi.fn();
    render(<MuiRallyViewer adapter={current} locale="ja" onViewReward={onViewReward} />);
    expect(screen.getByRole("heading", { name: "スタンプラリー達成！" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "景品" })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("region", { name: "スタンプラリー達成！" })).getByRole("button", {
        name: "特典を見る",
      }),
    );
    expect(onViewReward).toHaveBeenCalledWith("reward");
    expect(current.onClaimReward).not.toHaveBeenCalled();
  });

  it("shows detailed check-in progress feedback", async () => {
    const current = adapter({
      onCheckIn: vi.fn(async () => ({
        ok: true as const,
        value: {
          state: { ...state, records: [{ stampId: "first", acquiredAt: "" }] },
          record: { stampId: "first", acquiredAt: "" },
        },
      })),
    });
    render(<MuiRallyViewer adapter={current} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(screen.getAllByRole("status")[0]?.textContent).toContain("First spot"),
    );
    expect(screen.getAllByRole("status")[0]?.textContent).toContain("1/2");
  });

  it("shows availability and goal-oriented reward progress", () => {
    const current = adapter({
      config: {
        ...config,
        spots: [
          {
            id: "closed",
            orderIndex: 0,
            name: "Closed spot",
            conditions: [],
            availability: {
              timezone: "UTC",
              weekly: [{ dayOfWeek: 6, hours: [{ opensAt: "13:00", closesAt: "17:00" }] }],
            },
          },
          {
            id: "target",
            orderIndex: 1,
            name: "Target spot",
            conditions: [],
            availability: {
              timezone: "UTC",
              weekly: [{ dayOfWeek: 6, hours: [{ opensAt: "09:00", closesAt: "17:00" }] }],
            },
          },
        ],
        rewards: [
          {
            id: "prize",
            title: "Prize",
            type: "in_person",
            redemptionMethod: "manual_slide",
            requiredStampCount: 1,
            conditions: [{ type: "stamps", stampIds: ["target"] }],
          },
        ],
      },
      state: { ...state, rewards: [{ rewardId: "prize", status: "LOCKED" }] },
    });
    render(
      <MuiRallyViewer
        adapter={current}
        locale="ja"
        nextAction={{ strategy: "reward_goal", rewardId: "prize", now: "2026-09-26T12:00:00Z" }}
      />,
    );
    expect(screen.getAllByText("営業中").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "スポットの次回営業時間: 2026-09-26 13:00（UTC）。開催期間もご確認ください。",
      ),
    ).toBeTruthy();
    expect(screen.getByText("0 / 1")).toBeTruthy();
    expect(screen.getByText("必要なスポット: Target spot")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "チェックイン" });
    expect(buttons[0]).toHaveProperty("disabled", true);
    expect(buttons[1]).toHaveProperty("disabled", false);
  });

  it("updates completed mode from the local adapter result without subscribe", async () => {
    const completedConfig = {
      ...config,
      completion: { condition: { type: "stamp_count" as const, count: 1 } },
    };
    const current = adapter({
      config: completedConfig,
      onCheckIn: vi.fn(async () => ({
        ok: true as const,
        value: {
          state: { ...state, records: [{ stampId: "first", acquiredAt: "" }] },
          record: { stampId: "first", acquiredAt: "" },
        },
      })),
    });
    render(<MuiRallyViewer adapter={current} />);
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Stamp rally complete!" })).toBeTruthy(),
    );
    expect(screen.queryByRole("heading", { name: "Next spots" })).toBeNull();
  });

  it("omits explore mode when every spot is claimed", () => {
    render(
      <MuiRallyViewer
        config={{
          ...config,
          spots: [{ id: "first", orderIndex: 0, name: "First", conditions: [] }],
        }}
        adapter={adapter({
          config: {
            ...config,
            spots: [{ id: "first", orderIndex: 0, name: "First", conditions: [] }],
          },
          state: { ...state, records: [{ stampId: "first", acquiredAt: "" }] },
        })}
      />,
    );
    expect(screen.queryByRole("heading", { name: "More to explore" })).toBeNull();
  });

  it("renders next action and completion panels", () => {
    const firstSpot = config.spots[0];
    const secondSpot = config.spots[1];
    if (firstSpot === undefined || secondSpot === undefined) throw new Error("Test spots missing");
    render(
      <MuiRallyViewer
        config={{
          ...config,
          completion: { condition: { type: "stamp_count", count: 1 } },
          spots: [{ ...firstSpot, location: { latitude: 35, longitude: 139 } }, secondSpot],
        }}
        nextAction={{ currentLocation: { latitude: 35, longitude: 139 } }}
        adapter={adapter({
          config: {
            ...config,
            completion: { condition: { type: "stamp_count", count: 1 } },
            spots: [{ ...firstSpot, location: { latitude: 35, longitude: 139 } }, secondSpot],
          },
          state: { ...state, records: [{ stampId: "first", acquiredAt: "" }] },
        })}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Next spots" })).toBeNull();
    expect(screen.getByRole("heading", { name: "More to explore" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stamp rally complete!" })).toBeTruthy();
  });

  it("renders MUI cards, progress, locked status, sx, and render slots", () => {
    render(
      <MuiRallyViewer
        config={config}
        sx={{ maxWidth: 960 }}
        slotProps={{ root: { "data-testid": "viewer-root" } }}
        renderSpotCard={({ spot }) => <div data-testid={`custom-${spot.id}`}>{spot.id}</div>}
      />,
    );
    expect(screen.getByTestId("viewer-root")).toBeTruthy();
    expect(screen.getByText("MUI Rally")).toBeTruthy();
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0);
    expect(screen.getByTestId("custom-first")).toBeTruthy();
    expect(screen.getByTestId("custom-locked")).toBeTruthy();
  });

  it("uses the adapter to verify and redeem through a dialog", async () => {
    const current = adapter();
    render(<MuiRallyViewer adapter={current} />);
    fireEvent.click(screen.getByRole("button", { name: "View spot" }));
    expect(document.activeElement?.getAttribute("data-spot-id")).toBe("first");
    expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Locked" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(current.onClaimReward).toHaveBeenCalledWith("reward"));
  });
});

describe("MuiMetadataEditor", () => {
  it("separates public and server metadata into tabs", () => {
    const onPublicMetadataChange = vi.fn();
    const onServerMetadataChange = vi.fn();
    render(
      <MuiMetadataEditor
        publicMetadata={{ campaign: "spring" }}
        serverMetadata={{ internalId: "42" }}
        onPublicMetadataChange={onPublicMetadataChange}
        onServerMetadataChange={onServerMetadataChange}
      />,
    );
    expect(screen.getByDisplayValue("spring")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "serverMetadata" }));
    expect(screen.getByDisplayValue("42")).toBeTruthy();
  });
});

describe("MuiAdminRallyEditor", () => {
  it("uses useAdminRallyEditor and exposes MUI tabs and spot actions", () => {
    const initialConfig = {
      ...config,
      spots: config.spots.map((spot) => ({
        ...spot,
        conditions: [{ type: "passcode" as const, code: "" }],
      })),
      rewards: [],
    };
    const onChange = vi.fn();
    render(<MuiAdminRallyEditor config={initialConfig} onChange={onChange} />);
    expect(screen.getByRole("heading", { name: "Publish readiness" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Spots" }));
    fireEvent.click(screen.getByRole("button", { name: "Add spot" }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText("Spot 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Theme" }));
    expect(screen.getByLabelText("Primary color")).toBeTruthy();
  });
});
