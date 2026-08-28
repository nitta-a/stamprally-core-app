import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRallyEditor, JsonConfigIO } from "../src/index.js";

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

  it("keeps other locale values when editing a localized title", () => {
    const onChange = vi.fn();
    render(
      <AdminRallyEditor
        locale="ja"
        config={{
          id: "r",
          version: "1",
          title: { ja: "ラリー", en: "Rally" },
          spots: [],
          rewards: [],
        }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("ラリー"), { target: { value: "更新" } });
    expect(onChange.mock.lastCall?.[0].title).toEqual({ ja: "更新", en: "Rally" });
  });

  it("shows field-level errors for invalid JSON configuration", () => {
    const onImport = vi.fn();
    render(
      <JsonConfigIO
        config={{ id: "r", version: "1", title: "Rally", spots: [], rewards: [] }}
        onImport={onImport}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "JSON configuration" }), {
      target: { value: '{"spots":[{}]}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("alert").textContent).toContain("spots[0]");
    expect(onImport).not.toHaveBeenCalled();
  });
});
