import type { PublicRallyConfig, StampRallyState } from "@stamprally/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MuiAdminRallyEditor,
  MuiMetadataEditor,
  type MuiRallyAdapter,
  MuiRallyViewer,
} from "../src/index.js";

afterEach(() => cleanup());

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
  it("resolves built-in Japanese labels and keeps reward viewing separate from claiming", () => {
    const current = adapter({
      config: {
        ...config,
        completion: { condition: { type: "stamp_count", count: 1 } },
      },
      state: { ...state, records: [{ stampId: "first", acquiredAt: "" }] },
    });
    const onViewReward = vi.fn();
    render(<MuiRallyViewer adapter={current} locale="ja" onViewReward={onViewReward} />);
    expect(screen.getByRole("heading", { name: "スタンプラリー達成！" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "景品" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "特典を見る" }));
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
            availability: { timezone: "UTC", weekly: [] },
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
    expect(screen.getByText("0 / 1")).toBeTruthy();
    expect(screen.getByText("必要なスポット: Target spot")).toBeTruthy();
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

  it("uses the adapter to verify and redeem through a dialog", () => {
    const current = adapter();
    render(<MuiRallyViewer adapter={current} />);
    expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Locked" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(current.onClaimReward).toHaveBeenCalledWith("reward");
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
