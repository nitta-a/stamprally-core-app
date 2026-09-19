import { describe, expect, it } from "vitest";
import { calculateProgress, type PublicRallyConfig, type StampRallyState } from "../src/index.js";

describe("calculateProgress", () => {
  it("applies the configured completion condition without changing legacy progress", () => {
    const config: PublicRallyConfig = {
      id: "rally",
      version: "1",
      title: "Rally",
      completion: { condition: { type: "stamp_count", count: 2 } },
      spots: [
        { id: "a", orderIndex: 0, name: "A", conditions: [] },
        { id: "b", orderIndex: 1, name: "B", conditions: [] },
        { id: "c", orderIndex: 2, name: "C", conditions: [] },
      ],
      rewards: [],
    };
    const progress = calculateProgress(
      {
        rallyId: "rally",
        userId: null,
        records: [
          { stampId: "a", acquiredAt: "" },
          { stampId: "b", acquiredAt: "" },
        ],
        rewards: [],
        updatedAt: "",
      },
      config,
    );
    expect(progress).toMatchObject({
      acquired: 2,
      total: 3,
      percentage: (2 / 3) * 100,
      completionAcquired: 2,
      completionRequired: 2,
      completionPercentage: 100,
      isCompleted: true,
    });
  });

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
