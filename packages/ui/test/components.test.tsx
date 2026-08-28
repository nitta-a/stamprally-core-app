import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { RallyViewer } from "../src/index.js";

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
