import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { RallyViewer } from "../src/index.js";

describe("RallyViewer", () => {
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
