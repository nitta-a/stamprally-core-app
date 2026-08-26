import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeneralSettingsForm, JsonConfigIO, SpotItemForm } from "../src/index.js";

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
