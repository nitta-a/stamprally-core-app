import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminRallyEditor, GeneralSettingsForm, JsonConfigIO, SpotItemForm } from "../src/index.js";

const spot = {
  id: "one",
  name: { ja: "一", en: "One" },
  condition: { type: "instant" as const },
};
const config = {
  id: "admin",
  title: { ja: "管理", en: "Admin" },
  stamps: [spot],
};

afterEach(cleanup);

describe("admin UI", () => {
  it("builds universal spots, references, conditions, and rewards through GUI controls", () => {
    const universal = {
      id: "universal",
      version: "0.7.0",
      title: { ja: "管理", en: "Admin" },
      spots: [],
      rewards: [],
    } as const;
    const onChange = vi.fn();
    render(<AdminRallyEditor config={universal} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add spot" }));
    const next = onChange.mock.lastCall?.[0];
    expect(next.spots).toHaveLength(1);
    cleanup();
    render(
      <AdminRallyEditor
        config={{ ...universal, spots: next.spots } as typeof universal}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add external reference" }));
    fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        spots: [expect.objectContaining({ externalReferences: [expect.anything()] })],
      }),
    );
    cleanup();
    render(
      <AdminRallyEditor
        config={{ ...universal, spots: next.spots, rewards: [] } as typeof universal}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add reward" }));
    expect(onChange.mock.lastCall?.[0].rewards).toHaveLength(1);
  });

  it("edits general settings and spot conditions immutably", () => {
    const onChange = vi.fn();
    render(<GeneralSettingsForm config={config} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/sequential/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isSequential: true }));
    onChange.mockClear();
    render(<SpotItemForm spot={spot} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "geo" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        condition: { type: "geo", latitude: 0, longitude: 0, radiusMeters: 100 },
      }),
    );
  });

  it("validates imported JSON before emitting a config", () => {
    const onImport = vi.fn();
    render(<JsonConfigIO config={config} onImport={onImport} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: JSON.stringify(config) } });
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
  });
});
