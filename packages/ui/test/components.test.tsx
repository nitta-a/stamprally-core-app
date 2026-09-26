import type { PublicReward } from "@stamprally/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccountBackupBanner,
  CloudSyncButton,
  CompletionPanel,
  GpsProximityMeter,
  NextActionPanel,
  RallyViewer,
  StaffRedemptionView,
  SyncStatusBanner,
} from "../src/index.js";

afterEach(() => cleanup());

describe("SyncStatusBanner", () => {
  it("renders pending offline operations", () => {
    render(
      <SyncStatusBanner
        locale="ja"
        status={{
          syncState: "idle",
          isSyncing: false,
          pendingCount: 2,
          rejectedHistory: [],
          storageCapability: "localstorage",
          isStoragePersistent: true,
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("オフラインで記録中");
    expect(screen.getByRole("status").textContent).toContain("2件");
  });
});

describe("cloud account components", () => {
  it("offers account linking and manual sync callbacks", () => {
    const onLinkAccount = vi.fn();
    const onSync = vi.fn();
    render(
      <>
        <AccountBackupBanner onLinkAccount={onLinkAccount} />
        <CloudSyncButton onSync={onSync} accountLabel="member@gmail.com" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Google で連携" }));
    fireEvent.click(screen.getByRole("button", { name: "今すぐ同期" }));
    expect(onLinkAccount).toHaveBeenCalledOnce();
    expect(onSync).toHaveBeenCalledOnce();
    expect(screen.getByText("同期済み: member@gmail.com")).toBeTruthy();
  });
});

describe("RallyViewer", () => {
  it("keeps reward viewing separate from claiming and hides navigation without a location", () => {
    const onViewReward = vi.fn();
    const onClaimReward = vi.fn();
    const onNavigate = vi.fn();
    const reward: PublicReward = {
      id: "reward",
      title: "Prize",
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: 0,
    };
    render(
      <>
        <CompletionPanel
          progress={{
            acquired: 1,
            total: 1,
            percentage: 100,
            isCompleted: true,
            completionAcquired: 1,
            completionRequired: 1,
            completionPercentage: 100,
            nextAvailableSpots: [],
          }}
          rewards={[reward]}
          rewardStates={[{ rewardId: "reward", status: "AVAILABLE" }]}
          locale="ja"
          onViewReward={onViewReward}
          onClaimReward={onClaimReward}
        />
        <NextActionPanel
          suggestions={[
            { spot: { id: "without", orderIndex: 0, name: "No location", conditions: [] } },
            {
              spot: {
                id: "with",
                orderIndex: 1,
                name: "With location",
                conditions: [],
                location: { latitude: 35, longitude: 139 },
              },
            },
          ]}
          locale="ja"
          onNavigate={onNavigate}
        />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "特典を見る" }));
    expect(onViewReward).toHaveBeenCalledWith("reward");
    expect(onClaimReward).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "案内を見る" })).toHaveLength(1);
  });

  it("shows only unclaimed spots as the completed primary list", () => {
    render(
      <RallyViewer
        locale="ja"
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
            completion: { condition: { type: "stamp_count", count: 1 } },
            spots: [
              { id: "done", orderIndex: 0, name: "取得済み", conditions: [] },
              { id: "left", orderIndex: 1, name: "未取得", conditions: [] },
            ],
            rewards: [],
          },
          state: {
            rallyId: "r",
            userId: null,
            records: [{ stampId: "done", acquiredAt: "" }],
            rewards: [],
            updatedAt: "",
          },
          onCheckIn: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "もっと楽しむ" })).toBeTruthy();
    expect(screen.getAllByText("未取得")).toHaveLength(2);
    expect(screen.getByText(/取得済み\s*\(1\)/)).toBeTruthy();
  });

  it("shows availability and remaining spots for a reward goal", () => {
    render(
      <RallyViewer
        locale="ja"
        nextAction={{ strategy: "reward_goal", rewardId: "prize", now: "2026-09-26T12:00:00Z" }}
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
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
                type: "digital",
                redemptionMethod: "view_only",
                requiredStampCount: 1,
                conditions: [{ type: "stamps", stampIds: ["target"] }],
              },
            ],
          },
          state: {
            rallyId: "r",
            userId: null,
            records: [],
            rewards: [{ rewardId: "prize", status: "LOCKED" }],
            updatedAt: "",
          },
          onCheckIn: vi.fn(),
        }}
      />,
    );
    expect(screen.getAllByText("営業中").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Target spot" })).toBeTruthy();
    expect(screen.getByText("0 / 1")).toBeTruthy();
    expect(screen.getByText("Target spot", { selector: "li" })).toBeTruthy();
  });

  it("omits explore mode when every spot is claimed and counts all next candidates", () => {
    const suggestions = Array.from({ length: 10 }, (_, index) => ({
      spot: { id: `spot-${index}`, orderIndex: index, name: `Spot ${index}`, conditions: [] },
    }));
    render(
      <>
        <RallyViewer
          locale="en"
          adapter={{
            config: {
              id: "r",
              version: "1",
              title: "Rally",
              spots: [{ id: "done", orderIndex: 0, name: "Done", conditions: [] }],
              rewards: [],
            },
            state: {
              rallyId: "r",
              userId: null,
              records: [{ stampId: "done", acquiredAt: "" }],
              rewards: [],
              updatedAt: "",
            },
            onCheckIn: vi.fn(),
          }}
        />
        <NextActionPanel suggestions={suggestions} locale="ja" maxSuggestions={3} />
      </>,
    );
    expect(screen.queryByRole("heading", { name: "More to explore" })).toBeNull();
    expect(screen.getByText(/他に行けるスポット\s*\(9\)/)).toBeTruthy();
  });

  it("switches to completed mode without firing the completion callback on initial load", () => {
    const onNavigate = vi.fn();
    const onCompleted = vi.fn();
    render(
      <RallyViewer
        locale="en"
        nextAction={{ strategy: "nearest", currentLocation: { latitude: 35, longitude: 139 } }}
        onNavigate={onNavigate}
        onCompleted={onCompleted}
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
            completion: { condition: { type: "stamp_count", count: 1 } },
            spots: [
              {
                id: "s1",
                orderIndex: 0,
                name: "Near",
                conditions: [],
                location: { latitude: 35, longitude: 139 },
              },
              { id: "s2", orderIndex: 1, name: "Done", conditions: [] },
            ],
            rewards: [],
          },
          state: {
            rallyId: "r",
            userId: null,
            records: [{ stampId: "s2", acquiredAt: "" }],
            rewards: [],
            updatedAt: "",
          },
          onCheckIn: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Next spots" })).toBeNull();
    expect(screen.getByRole("heading", { name: "More to explore" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Stamp rally complete!" })).toBeTruthy();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("uses completion progress as primary progress for partial completion", () => {
    render(
      <RallyViewer
        locale="en"
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
            completion: { condition: { type: "stamp_count", count: 1 } },
            spots: [
              { id: "s1", orderIndex: 0, name: "One", conditions: [] },
              { id: "s2", orderIndex: 1, name: "Two", conditions: [] },
            ],
            rewards: [],
          },
          state: {
            rallyId: "r",
            userId: null,
            records: [],
            rewards: [],
            updatedAt: "",
          },
          onCheckIn: vi.fn(),
        }}
      />,
    );
    expect((screen.getByRole("progressbar") as HTMLProgressElement).value).toBe(0);
    expect(screen.getByText("0/1")).toBeTruthy();
    expect(screen.getByText("Overall: 0/2")).toBeTruthy();
  });

  it("reports the stamped spot and current completion progress", async () => {
    const onCheckIn = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: {
          rallyId: "r",
          userId: null,
          records: [{ stampId: "s", acquiredAt: "" }],
          rewards: [],
          updatedAt: "",
        },
        record: { stampId: "s", acquiredAt: "" },
      },
    }));
    render(
      <RallyViewer
        locale="en"
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
            completion: { condition: { type: "stamp_count", count: 2 } },
            spots: [
              {
                id: "s",
                orderIndex: 0,
                name: "Park",
                conditions: [{ type: "custom", validatorName: "demo" }],
              },
            ],
            rewards: [],
          },
          onCheckIn,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Proof"), { target: { value: "proof" } });
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Park collected. 1/2 to complete."),
    );
  });

  it("keeps QR manual entry as a single fallback check-in action", () => {
    render(
      <RallyViewer
        locale="en"
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
            spots: [{ id: "s", orderIndex: 0, name: "QR spot", conditions: [{ type: "qr" }] }],
            rewards: [],
          },
          onCheckIn: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Scan QR" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Check in" })).toHaveLength(1);
  });

  it("renders spot and feedback slots with the deepest style hooks", () => {
    render(
      <RallyViewer
        locale="en"
        config={{
          id: "r",
          version: "1",
          title: "Rally",
          spots: [{ id: "s", orderIndex: 0, name: "Spot", conditions: [] }],
          rewards: [],
        }}
        classNames={{ root: "root", card: "card", badge: "badge", slot: "slot", button: "button" }}
        styles={{ slot: { color: "red" } }}
        renderSpotCard={({ spot, children }) => (
          <div data-testid="custom-card">
            {spot.id}
            {children}
          </div>
        )}
      />,
    );
    expect(screen.getByTestId("custom-card").textContent).toContain("s");
    expect(screen.getByRole("region", { name: "Stamp rally" }).classList.contains("root")).toBe(
      true,
    );
  });

  it("allows replacing a condition renderer", () => {
    const onCheckIn = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: { rallyId: "r", userId: null, records: [], rewards: [], updatedAt: "" },
        record: { stampId: "s", acquiredAt: "" },
      },
    }));
    function Custom({ onSubmit }: { readonly onSubmit: (proof: unknown) => void }): ReactElement {
      return (
        <button type="button" onClick={() => onSubmit("custom-proof")}>
          Custom verify
        </button>
      );
    }
    render(
      <RallyViewer
        locale="en"
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
            spots: [
              {
                id: "s",
                orderIndex: 0,
                name: "Spot",
                conditions: [{ type: "custom", validatorName: "demo" }],
              },
            ],
            rewards: [],
          },
          onCheckIn,
        }}
        customConditionRenderers={{ custom: Custom }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom verify" }));
    expect(onCheckIn).toHaveBeenCalledWith("s", "custom-proof");
  });

  it("renders standard spot and reward details and disables locked verification", () => {
    const onCheckIn = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: {
          rallyId: "r",
          userId: null,
          records: [],
          rewards: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        record: { stampId: "s1", acquiredAt: "2026-01-01T00:00:00.000Z" },
      },
    }));
    render(
      <RallyViewer
        locale="en"
        adapter={{
          config: {
            id: "r",
            version: "1",
            title: "Rally",
            spots: [
              {
                id: "s1",
                orderIndex: 0,
                name: "First",
                description: "First description",
                hint: "Look near the gate",
                iconUrl: "/icon.png",
                externalReferences: [{ type: "map", id: "m1" }],
                conditions: [],
              },
              {
                id: "s2",
                orderIndex: 1,
                name: "Locked",
                prerequisites: ["s1"],
                conditions: [{ type: "passcode" }],
              },
            ],
            rewards: [
              {
                id: "reward",
                title: "Prize",
                description: "Prize details",
                type: "digital",
                redemptionMethod: "view_only",
                requiredStampCount: 1,
                stockLimit: 2,
                validUntil: "2030-01-01T00:00:00.000Z",
              },
            ],
          },
          onCheckIn,
        }}
      />,
    );
    expect(screen.getByText("First description")).toBeTruthy();
    expect(screen.getByText("Look near the gate")).toBeTruthy();
    expect(screen.getByText(/External references/)).toBeTruthy();
    expect(screen.getByText("Prize details")).toBeTruthy();
    expect(screen.getByText("Only a few left")).toBeTruthy();
    expect(screen.getAllByText(/LOCKED/).length).toBeGreaterThan(0);
    expect(screen.getByText("Complete First to unlock this spot.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check in" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    expect(onCheckIn).not.toHaveBeenCalled();
  });
});

describe("participant utility components", () => {
  it("shows GPS proximity and completes a staff redemption", async () => {
    render(
      <>
        <GpsProximityMeter
          currentPosition={{ latitude: 35, longitude: 135 }}
          targetPosition={{ latitude: 35.0001, longitude: 135 }}
          radiusMeters={100}
          locale="en"
        />
        <StaffRedemptionView onRedeem={vi.fn(async () => ({ ok: true }))} locale="en" />
      </>,
    );
    expect(screen.getByText("You are inside the check-in area")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Ticket number or QR value"), {
      target: { value: "T-1" },
    });
    fireEvent.change(screen.getByLabelText("Staff passcode"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Redeem ticket" }));
    expect(await screen.findByText("Exchange completed")).toBeTruthy();
  });
});
