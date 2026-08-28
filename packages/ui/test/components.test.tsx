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
});
