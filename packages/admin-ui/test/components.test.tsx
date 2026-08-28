import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRallyEditor, JsonConfigIO, useAdminRallyEditor } from "../src/index.js";

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

  it("supports duplicate, reorder, undo, and redo through the headless API", () => {
    const initial = {
      id: "r",
      version: "1",
      title: "Rally",
      spots: [
        {
          id: "s1",
          orderIndex: 0,
          name: "One",
          conditions: [{ type: "passcode" as const, code: "1" }],
        },
        {
          id: "s2",
          orderIndex: 1,
          name: "Two",
          conditions: [{ type: "passcode" as const, code: "2" }],
        },
      ],
      rewards: [],
    };
    const { result } = renderHook(() => useAdminRallyEditor(initial));
    act(() => result.current.duplicateSpot("s1"));
    expect(result.current.config.spots).toHaveLength(3);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.config.spots).toHaveLength(2);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.config.spots).toHaveLength(3);
    act(() => result.current.reorderSpots(0, 2));
    expect(result.current.config.spots[2]?.orderIndex).toBe(2);
  });
});
