import { describe, expect, it } from "vitest";
import {
  getNextSpotSuggestions,
  type PublicRallyConfig,
  type StampRallyState,
} from "../src/index.js";

const config: PublicRallyConfig = {
  id: "rally",
  version: "1",
  title: "Rally",
  spots: [
    {
      id: "a",
      orderIndex: 0,
      name: "A",
      conditions: [],
      location: { latitude: 35, longitude: 139 },
    },
    { id: "b", orderIndex: 1, name: "B", conditions: [] },
    {
      id: "c",
      orderIndex: 2,
      name: "C",
      conditions: [],
      location: { latitude: 35.01, longitude: 139 },
    },
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

describe("getNextSpotSuggestions", () => {
  it("uses order by default and distance when requested", () => {
    expect(getNextSpotSuggestions(state, config).map(({ spot }) => spot.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      getNextSpotSuggestions(state, config, {
        strategy: "nearest",
        currentLocation: { latitude: 35.009, longitude: 139 },
      }).map(({ spot }) => spot.id),
    ).toEqual(["c", "a", "b"]);
  });

  it("reuses progress filtering and supports a limit", () => {
    const next = getNextSpotSuggestions(
      { ...state, records: [{ stampId: "a", acquiredAt: "" }] },
      {
        ...config,
        spots: config.spots.map((spot) =>
          spot.id === "c" ? { ...spot, prerequisites: ["a"] } : spot,
        ),
      },
      { limit: 1 },
    );
    expect(next.map(({ spot }) => spot.id)).toEqual(["b"]);
  });
});
