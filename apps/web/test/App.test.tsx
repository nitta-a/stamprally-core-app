import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("demo app", () => {
  it("renders the participant viewer", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "City Walk Rally" })).toBeTruthy();
  });
});
