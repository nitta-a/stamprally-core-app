import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";

beforeEach(() => {
  window.localStorage.clear();
});

describe("StampSheet App", () => {
  it("optimistically stamps, persists, restores without animation, and resets", async () => {
    const first = render(<App />);
    const welcome = await screen.findByRole("button", { name: /#01 Welcome Gate、取得可能/ });
    fireEvent.click(welcome);
    fireEvent.click(screen.getByRole("button", { name: "スタンプを押す" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /#01 Welcome Gate、取得済み/ })).toBeTruthy(),
    );
    expect(document.querySelector(".stamp-imprint.stamp-press")).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    first.unmount();
    render(<App />);
    await screen.findByRole("button", { name: /#01 Welcome Gate、取得済み/ });
    expect(document.querySelector(".stamp-imprint.stamp-press")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reset Sheet" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /#01 Welcome Gate、取得可能/ })).toBeTruthy(),
    );
  });

  it("shows the completed sheet from persisted state", async () => {
    const acquiredAt = "2026-08-23T12:00:00.000Z";
    window.localStorage.setItem(
      "stamprally:stamp-sheet-demo-v1",
      JSON.stringify({
        rallyId: "stamp-sheet-demo-v1",
        records: ["a", "b", "c", "d", "e", "f"].map((suffix) => ({
          stampId: `spot-${suffix}`,
          acquiredAt,
        })),
        updatedAt: acquiredAt,
      }),
    );
    render(<App />);

    expect(await screen.findByText("COMPLETE!!")).toBeTruthy();
    expect(screen.getByText("RALLY COMPLETED")).toBeTruthy();
  });

  it("switches to Free mode while preserving the same rally state", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /#01 Welcome Gate/ });
    fireEvent.click(screen.getByRole("radio", { name: "Free" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /#06 Tokyo Tower、取得可能/ })).toBeTruthy(),
    );
  });
});
