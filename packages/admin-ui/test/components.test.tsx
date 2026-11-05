import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminRallyEditor,
  CompletionConditionForm,
  JsonConfigIO,
  RallyAvailabilityForm,
  SpotItemForm,
  useAdminRallyEditor,
} from "../src/index.js";

afterEach(() => cleanup());

describe("AdminRallyEditor", () => {
  it("edits rally times and completion defaults through reusable forms", () => {
    const config = {
      id: "r",
      version: "1",
      title: "Rally",
      spots: [{ id: "a", orderIndex: 0, name: "A", conditions: [] }],
      rewards: [],
    };
    const onChange = vi.fn();
    render(
      <>
        <RallyAvailabilityForm
          config={config}
          onChange={onChange}
          locale="en"
          defaultTimezone="Asia/Tokyo"
        />
        <CompletionConditionForm
          config={config}
          onChange={onChange}
          locale="en"
          initialCount={3}
          initialStampIds={[]}
        />
      </>,
    );
    fireEvent.change(screen.getByLabelText("startsAt"), { target: { value: "2026-10-01T09:30" } });
    expect(onChange.mock.lastCall?.[0].availability).toEqual({
      startsAt: "2026-10-01T00:30:00.000Z",
      timezone: "Asia/Tokyo",
    });
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "stamp_count" } });
    expect(onChange.mock.lastCall?.[0].completion.condition).toEqual({
      type: "stamp_count",
      count: 3,
    });
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "stamps" } });
    expect(onChange.mock.lastCall?.[0].completion.condition).toEqual({
      type: "stamps",
      stampIds: [],
    });
  });
  it("keeps focus in the passcode field while editing a condition", () => {
    function Fixture() {
      const [spot, setSpot] = useState<SpotItem>({
        id: "s",
        orderIndex: 0,
        name: "Spot",
        conditions: [{ type: "passcode", code: "" }],
      });
      return <SpotItemForm spot={spot} onChange={setSpot} />;
    }
    render(<Fixture />);
    const input = screen.getByLabelText("Passcode");
    input.focus();
    fireEvent.change(input, { target: { value: "OPEN" } });
    expect(document.activeElement).toBe(input);
  });
  it("shows preflight findings and edits structured spot hours", () => {
    const onChange = vi.fn();
    render(
      <>
        <AdminRallyEditor
          config={{ id: "r", version: "1", title: "Rally", spots: [], rewards: [] }}
          onChange={vi.fn()}
        />
        <SpotItemForm
          spot={{ id: "spot", orderIndex: 0, name: "Spot", conditions: [] }}
          onChange={onChange}
        />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Publish readiness" })).toBeTruthy();
    const addHoursButton = screen.getAllByRole("button", { name: "Add hours" })[0];
    if (addHoursButton === undefined) throw new Error("Expected an add-hours control.");
    fireEvent.click(addHoursButton);
    expect(onChange.mock.lastCall?.[0].availability?.weekly).toEqual([
      { dayOfWeek: 0, hours: [{ opensAt: "09:00", closesAt: "17:00" }] },
    ]);
  });

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
      rewards: [
        {
          id: "r1",
          title: "First",
          type: "digital" as const,
          redemptionMethod: "server_claim" as const,
          requiredStampCount: 1,
        },
        {
          id: "r2",
          title: "Second",
          type: "digital" as const,
          redemptionMethod: "server_claim" as const,
          requiredStampCount: 2,
        },
      ],
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
    act(() => {
      result.current.update({ title: "Updated" });
      result.current.update({ description: "Description" });
      result.current.reorderRewards(0, 1);
    });
    expect(result.current.config.title).toBe("Updated");
    expect(result.current.config.description).toBe("Description");
    expect(result.current.config.rewards.map((reward) => reward.id)).toEqual(["r2", "r1"]);
  });

  it("accepts a new external config when the draft is clean", () => {
    const initial = { id: "r", version: "1", title: "Initial", spots: [], rewards: [] };
    const { result, rerender } = renderHook(
      ({ config }: { config: typeof initial }) => useAdminRallyEditor(config),
      { initialProps: { config: initial } },
    );
    const next = { ...initial, title: "External" };
    rerender({ config: next });
    expect(result.current.config.title).toBe("External");
  });

  it("renders prerequisite checkboxes when availableSpots is provided", () => {
    const onChange = vi.fn();
    render(
      <SpotItemForm
        spot={{ id: "s2", orderIndex: 1, name: "Riverside", conditions: [] }}
        availableSpots={[
          { id: "s1", name: "Welcome Center" },
          { id: "s2", name: "Riverside" },
        ]}
        onChange={onChange}
      />,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Welcome Center" });
    expect(screen.queryByRole("checkbox", { name: "Riverside" })).toBeNull();
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ prerequisites: ["s1"] }));
  });
});

import type { SpotItem } from "@stamprally/core";
