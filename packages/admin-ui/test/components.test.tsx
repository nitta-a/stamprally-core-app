import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRallyEditor } from "../src/index.js";

describe("AdminRallyEditor", () => {
  it("edits the canonical admin model", () => {
    const onChange = vi.fn();
    render(
      <AdminRallyEditor
        config={{ id: "r", version: "1", title: "Rally", spots: [], rewards: [] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add spot" }));
    expect(onChange.mock.lastCall?.[0].spots).toHaveLength(1);
  });
});
