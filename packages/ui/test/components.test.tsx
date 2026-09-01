import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AccountBackupBanner,
  CloudSyncButton,
  GpsProximityMeter,
  RallyViewer,
  StaffRedemptionView,
  SyncStatusBanner,
} from "../src/index.js";

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
