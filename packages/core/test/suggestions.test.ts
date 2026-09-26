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

  it("orders nearest suggestions deterministically when locations are missing or tied", () => {
    const tied = {
      ...config,
      spots: [
        {
          id: "z",
          orderIndex: 1,
          name: "Z",
          conditions: [],
          location: { latitude: 35, longitude: 139 },
        },
        {
          id: "a",
          orderIndex: 1,
          name: "A",
          conditions: [],
          location: { latitude: 35, longitude: 139 },
        },
        { id: "b", orderIndex: 2, name: "B", conditions: [] },
      ],
    } satisfies PublicRallyConfig;
    expect(
      getNextSpotSuggestions(state, tied, {
        strategy: "nearest",
        currentLocation: { latitude: 35, longitude: 139 },
      }).map(({ spot }) => spot.id),
    ).toEqual(["a", "z", "b"]);
  });

  it("prioritizes open reward-goal spots and suppresses suggestions outside the rally period", () => {
    const goalConfig: PublicRallyConfig = {
      ...config,
      availability: { startsAt: "2026-09-26T00:00:00Z", endsAt: "2026-09-27T00:00:00Z" },
      spots: [
        {
          id: "closed",
          orderIndex: 0,
          name: "Closed",
          conditions: [],
          availability: { timezone: "UTC", weekly: [] },
        },
        { id: "target", orderIndex: 1, name: "Target", conditions: [] },
      ],
      rewards: [
        {
          id: "goal",
          title: "Goal",
          type: "digital",
          redemptionMethod: "view_only",
          requiredStampCount: 1,
          conditions: [{ type: "stamps", stampIds: ["target"] }],
        },
      ],
    };
    const active = getNextSpotSuggestions(state, goalConfig, {
      strategy: "reward_goal",
      rewardId: "goal",
      now: "2026-09-26T12:00:00Z",
    });
    expect(active.map(({ spot }) => spot.id)).toEqual(["target", "closed"]);
    expect(getNextSpotSuggestions(state, goalConfig, { now: "2026-09-28T00:00:00Z" })).toEqual([]);
  });
});
