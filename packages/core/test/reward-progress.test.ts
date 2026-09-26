import { describe, expect, it } from "vitest";
import {
  calculateRewardProgress,
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
  it("returns undefined for an unknown reward", () => {
    expect(calculateRewardProgress("missing", state, config)).toBeUndefined();
  });
});
