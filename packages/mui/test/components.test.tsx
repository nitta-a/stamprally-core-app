import type { PublicRallyConfig, StampRallyState } from "@stamprally/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("progressbar")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("tab", { name: "Spots" }));
    fireEvent.click(screen.getByRole("button", { name: "Add spot" }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText("Spot 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Theme" }));
    expect(screen.getByLabelText("Primary color")).toBeTruthy();
  });
});
