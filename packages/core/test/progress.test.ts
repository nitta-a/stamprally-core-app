import { describe, expect, it } from "vitest";
import { calculateProgress, type PublicRallyConfig, type StampRallyState } from "../src/index.js";

describe("calculateProgress", () => {
  it("only exposes unclaimed spots whose prerequisites are complete", () => {
    const config: PublicRallyConfig = {
      id: "rally",
      version: "1",
      title: "Rally",
      spots: [
        { id: "a", orderIndex: 0, name: "A", conditions: [] },
        { id: "b", orderIndex: 1, name: "B", prerequisites: ["a"], conditions: [] },
        { id: "c", orderIndex: 2, name: "C", prerequisites: ["b"], conditions: [] },
      ],
      rewards: [],
    };
    const state: StampRallyState = {
      rallyId: "rally",
      userId: null,
      records: [],
      rewards: [],
      updatedAt: "",
    };
    expect(calculateProgress(state, config).nextAvailableSpots.map((spot) => spot.id)).toEqual([
      "a",
    ]);
    expect(
      calculateProgress(
        { ...state, records: [{ stampId: "a", acquiredAt: "" }] },
        config,
      ).nextAvailableSpots.map((spot) => spot.id),
    ).toEqual(["b"]);
  });
});
