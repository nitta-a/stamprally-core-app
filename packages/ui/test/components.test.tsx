import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StampSheet, StampSlot } from "../src/index.js";

const stamp = {
  id: "one",
  name: { ja: "一", en: "One" },
  condition: { type: "instant" as const },
};
const config = {
  id: "ui",
  stamps: [stamp],
};

afterEach(cleanup);

describe("participant UI", () => {
  it("renders accessible stamp slots and emits selection", () => {
    const onSelect = vi.fn();
    render(<StampSlot stamp={stamp} isNext={true} slotNumber={1} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /一.*available/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders a progress bar and grid", () => {
    render(<StampSheet config={config} title={{ ja: "台紙", en: "Sheet" }} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("button", { name: /一/i })).toBeTruthy();
  });
});
