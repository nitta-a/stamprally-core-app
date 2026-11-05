import { describe, expect, it } from "vitest";
import {
  calculateRewardProgress,
  getRewardAvailability,
  type PublicRallyConfig,
  type StampRallyState,
} from "../src/index.js";

const config: PublicRallyConfig = {
  id: "rally",
  version: "1",
  title: "Rally",
  spots: ["a", "b", "c"].map((id, orderIndex) => ({ id, orderIndex, name: id, conditions: [] })),
  rewards: [
    {
      id: "prize",
      title: "Prize",
      type: "digital",
      redemptionMethod: "view_only",
      requiredStampCount: 1,
      conditions: [
        {
          type: "all",
          conditions: [
            { type: "stamps", stampIds: ["a"] },
            {
              type: "any",
              conditions: [
                { type: "stamps", stampIds: ["b"] },
                { type: "stamps", stampIds: ["c"] },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const state: StampRallyState = {
  rallyId: "rally",
  userId: null,
  records: [],
  rewards: [],
  updatedAt: "",
};

describe("calculateRewardProgress", () => {
  it("reports stock availability using shared and reward inventory", () => {
    const reward = config.rewards[0];
    if (reward === undefined) throw new Error("Expected reward.");
    const stocked = { ...reward, stockLimit: 2 };
    const current = { rewardId: reward.id, status: "AVAILABLE" as const, redeemedCount: 1 };
    expect(getRewardAvailability(stocked, current)).toEqual({ available: true, remaining: 1 });
    expect(getRewardAvailability(stocked, current, { sharedRemaining: 0 }).available).toBe(false);
    expect(getRewardAvailability(stocked, current, { rewardRemaining: { prize: 0 } })).toEqual({
      available: false,
      remaining: 0,
    });
    expect(getRewardAvailability(stocked, undefined).available).toBe(false);
  });
  it("counts acquired stamps toward count-only rewards without inventing missing stamps", () => {
    const reward = config.rewards[0];
    if (reward === undefined) throw new Error("Expected reward.");
    const countConfig = {
      ...config,
      rewards: [{ ...reward, requiredStampCount: 2, conditions: [] }],
    };
    const one = { ...state, records: [{ stampId: "a", acquiredAt: "" }] };
    expect(calculateRewardProgress("prize", one, countConfig)).toMatchObject({
      acquired: 1,
      required: 2,
      percentage: 50,
      missingStampIds: ["b"],
    });
    const two = { ...one, records: [...one.records, { stampId: "b", acquiredAt: "" }] };
    expect(calculateRewardProgress("prize", two, countConfig)).toMatchObject({
      acquired: 2,
      required: 2,
      percentage: 100,
      missingStampIds: [],
      isUnlocked: true,
    });
  });

  it("counts mandatory and flexible stamps independently", () => {
    const reward = config.rewards[0];
    if (reward === undefined) throw new Error("Expected reward.");
    const mixed = {
      ...config,
      rewards: [
        {
          ...reward,
          requiredStampCount: 2,
          conditions: [{ type: "stamps" as const, stampIds: ["a"] }],
        },
      ],
    };
    const other = { ...state, records: [{ stampId: "b", acquiredAt: "" }] };
    expect(calculateRewardProgress("prize", other, mixed)).toMatchObject({
      acquired: 1,
      required: 2,
      missingStampIds: ["a"],
      isUnlocked: false,
    });
    const complete = { ...other, records: [...other.records, { stampId: "a", acquiredAt: "" }] };
    expect(calculateRewardProgress("prize", complete, mixed)).toMatchObject({
      acquired: 2,
      required: 2,
      missingStampIds: [],
      isUnlocked: true,
    });
  });

  it("does not count nonexistent spots toward an impossible goal", () => {
    const reward = config.rewards[0];
    if (reward === undefined) throw new Error("Expected reward.");
    const impossible = {
      ...config,
      rewards: [{ ...reward, requiredStampCount: 5, conditions: [] }],
    };
    const one = { ...state, records: [{ stampId: "a", acquiredAt: "" }] };
    expect(calculateRewardProgress("prize", one, impossible)).toMatchObject({
      acquired: 1,
      required: 5,
      percentage: 20,
      missingStampIds: ["b", "c"],
      isUnlocked: false,
    });
  });
  it("reports nested all/any requirements and unlocks when a branch is met", () => {
    const progress = calculateRewardProgress(
      "prize",
      {
        ...state,
        records: [
          { stampId: "a", acquiredAt: "" },
          { stampId: "b", acquiredAt: "" },
        ],
      },
      config,
    );
    expect(progress).toEqual({
      rewardId: "prize",
      isUnlocked: true,
      acquired: 2,
      required: 2,
      percentage: 100,
      missingStampIds: [],
    });
  });
  it("chooses alternatives together with other required stamps", () => {
    const reward = config.rewards[0];
    if (reward === undefined) throw new Error("Expected reward.");
    const overlapping = {
      ...config,
      rewards: [
        {
          ...reward,
          conditions: [
            {
              type: "any" as const,
              conditions: [
                { type: "stamps" as const, stampIds: ["a"] },
                { type: "stamps" as const, stampIds: ["b"] },
              ],
            },
            { type: "stamps" as const, stampIds: ["b"] },
          ],
        },
      ],
    };
    expect(calculateRewardProgress("prize", state, overlapping)).toMatchObject({
      required: 1,
      missingStampIds: ["b"],
      isUnlocked: false,
    });
    expect(
      calculateRewardProgress(
        "prize",
        {
          ...state,
          records: [{ stampId: "b", acquiredAt: "" }],
        },
        overlapping,
      ),
    ).toMatchObject({ percentage: 100, missingStampIds: [], isUnlocked: true });
  });
  it("returns undefined for an unknown reward", () => {
    expect(calculateRewardProgress("missing", state, config)).toBeUndefined();
  });
});
