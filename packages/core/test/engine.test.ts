import { describe, expect, it } from "vitest";
import {
  type AdminRallyConfig,
  calculateDistanceMeters,
  consumeReward,
  evaluateCondition,
  evaluateConditionDetailed,
  evaluateSpotStatus,
  getOrderedSpots,
  issueClaimTicketNumber,
  processStamp,
  type Reward,
  type RewardState,
  reconcileRewardStates,
  type StampRallyState,
  sortOperationsDeterministically,
} from "../src/index.js";

const baseState: StampRallyState = {
  rallyId: "rally",
  userId: "user",
  records: [],
  rewards: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("condition evaluation", () => {
  it("evaluates proof types and returns detailed mismatch reasons", () => {
    expect(
      evaluateCondition({ type: "qr", secretToken: "token" }, { type: "qr", token: "token" }),
    ).toBe(true);
    expect(
      evaluateConditionDetailed(
        { type: "qr", secretToken: "token" },
        { type: "passcode", code: "token" },
      ),
    ).toMatchObject({ ok: false, error: { conditionType: "qr", reason: "INVALID_PROOF" } });
    expect(
      evaluateCondition(
        { type: "passcode", code: "Open", caseSensitive: false },
        { type: "passcode", code: "open" },
      ),
    ).toBe(true);
    expect(
      evaluateCondition({ type: "passcode", code: "Open" }, { type: "passcode", code: "open" }),
    ).toBe(false);
    expect(evaluateCondition({ type: "nfc", tagId: "tag" }, { type: "nfc", tagId: "tag" })).toBe(
      true,
    );
    expect(
      evaluateCondition(
        { type: "custom", validatorName: "validator" },
        { type: "custom", value: true },
      ),
    ).toBe(false);
  });

  it("checks GPS radius and rejects invalid coordinates", () => {
    const condition = { type: "gps" as const, latitude: 35, longitude: 139, radiusMeters: 0 };
    expect(
      evaluateConditionDetailed(condition, { type: "gps", latitude: 35, longitude: 139 }),
    ).toMatchObject({
      ok: true,
      value: { conditionType: "gps", distanceMeters: 0 },
    });
    expect(
      evaluateConditionDetailed(condition, { type: "gps", latitude: 35.001, longitude: 139 }),
    ).toMatchObject({ ok: false, error: { reason: "OUTSIDE_RADIUS", radiusMeters: 0 } });
    expect(
      evaluateConditionDetailed(condition, { type: "gps", latitude: Number.NaN, longitude: 139 }),
    ).toMatchObject({ ok: false, error: { reason: "INVALID_GEO_INPUT" } });
    expect(calculateDistanceMeters(35, 139, 35, 139)).toBe(0);
  });
});

describe("stamp and reward transitions", () => {
  const config: AdminRallyConfig = {
    id: "rally",
    version: "1",
    title: "Rally",
    spots: [
      { id: "first", orderIndex: 0, name: "First", conditions: [] },
      { id: "second", orderIndex: 1, name: "Second", prerequisites: ["first"], conditions: [] },
    ],
    rewards: [
      {
        id: "reward",
        title: "Reward",
        type: "digital",
        redemptionMethod: "manual_slide",
        requiredStampCount: 1,
      },
    ],
  };

  it("returns typed errors and leaves the input state unchanged", () => {
    expect(
      processStamp(baseState, config, "missing", { type: "custom", value: null }, "now"),
    ).toMatchObject({
      ok: false,
      error: { code: "SPOT_NOT_FOUND" },
    });
    expect(
      processStamp(baseState, config, "second", { type: "custom", value: null }, "now"),
    ).toMatchObject({
      ok: false,
      error: { code: "PREREQUISITES_NOT_MET" },
    });
    const result = processStamp(
      baseState,
      config,
      "first",
      { type: "custom", value: null },
      "2026-01-01T00:00:01.000Z",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nextState.records).toEqual([
      { stampId: "first", acquiredAt: "2026-01-01T00:00:01.000Z" },
    ]);
    expect(result.value.nextState.rewards).toMatchObject([
      { rewardId: "reward", status: "AVAILABLE", unlockedAt: "2026-01-01T00:00:01.000Z" },
    ]);
    expect(baseState.records).toEqual([]);
    expect(
      processStamp(result.value.nextState, config, "first", { type: "custom", value: null }, "now"),
    ).toMatchObject({
      ok: false,
      error: { code: "STAMP_ALREADY_ACQUIRED" },
    });
  });

  it("reconciles expiry and stock without overwriting terminal states", () => {
    const reward: Reward = {
      id: "reward",
      title: "Reward",
      type: "digital",
      redemptionMethod: "manual_slide",
      requiredStampCount: 1,
      validUntil: "2026-01-02T00:00:00.000Z",
      stockLimit: 1,
    };
    const consumed: RewardState = { rewardId: "reward", status: "CONSUMED", redeemedCount: 1 };
    expect(reconcileRewardStates([reward], [consumed], 0, "2026-01-03T00:00:00.000Z")).toEqual([
      consumed,
    ]);
    expect(reconcileRewardStates([reward], [], 0, "2026-01-01T00:00:00.000Z")).toEqual([
      { rewardId: "reward", status: "LOCKED" },
    ]);
    expect(reconcileRewardStates([reward], [], 1, "2026-01-03T00:00:00.000Z")).toEqual([
      { rewardId: "reward", status: "EXPIRED" },
    ]);
  });

  it("enforces claim status, expiry, stock, limits, and staff passcodes", () => {
    const reward: Reward = {
      id: "reward",
      title: "Reward",
      type: "in_person",
      redemptionMethod: "staff_passcode",
      requiredStampCount: 0,
      staffPasscode: "OPEN",
      stockLimit: 1,
      userClaimLimit: 1,
    };
    const params = { reward, now: "2026-01-01T00:00:00.000Z" };
    expect(
      consumeReward({ ...params, currentState: { rewardId: "reward", status: "LOCKED" } }),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_AVAILABLE" },
    });
    expect(
      consumeReward({
        ...params,
        currentState: { rewardId: "reward", status: "AVAILABLE" },
        inputPasscode: "bad",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_PASSCODE" },
    });
    const consumed = consumeReward({
      ...params,
      currentState: { rewardId: "reward", status: "AVAILABLE" },
      inputPasscode: " open ",
      staffId: "staff",
    });
    expect(consumed).toMatchObject({
      ok: true,
      value: { status: "CONSUMED", redeemedCount: 1, consumedByStaffId: "staff" },
    });
    expect(
      consumeReward({
        ...params,
        currentState: { rewardId: "reward", status: "AVAILABLE", redeemedCount: 1 },
        inputPasscode: "OPEN",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "OUT_OF_STOCK" },
    });
    expect(
      consumeReward({
        ...params,
        currentState: { rewardId: "reward", status: "AVAILABLE" },
        inputPasscode: "OPEN",
        userRedemptionCount: 1,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "USER_LIMIT_REACHED" },
    });
    expect(
      consumeReward({ ...params, currentState: { rewardId: "reward", status: "CONSUMED" } }),
    ).toMatchObject({
      ok: false,
      error: { code: "ALREADY_CONSUMED" },
    });
  });
});

describe("ordering and presentation state", () => {
  it("sorts without mutating input and preserves deterministic tie ordering", () => {
    const spots = [
      { id: "late", orderIndex: 2, name: "Late", conditions: [] },
      { id: "first", orderIndex: 1, name: "First", conditions: [] },
    ];
    expect(getOrderedSpots(spots).map((spot) => spot.id)).toEqual(["first", "late"]);
    expect(spots.map((spot) => spot.id)).toEqual(["late", "first"]);
    expect(
      sortOperationsDeterministically([
        { operationId: "b", timestamp: 1 },
        { operationId: "a", timestamp: 1 },
        { operationId: "c", timestamp: 0 },
      ]).map((operation) => operation.operationId),
    ).toEqual(["c", "a", "b"]);
  });

  it("reports verifying, locked, and claimed spot states", () => {
    expect(evaluateSpotStatus({ id: "s" }, { records: [] }, { verifying: true })).toBe("VERIFYING");
    expect(evaluateSpotStatus({ id: "s", prerequisites: ["p"] }, { records: [] })).toBe("LOCKED");
    expect(evaluateSpotStatus({ id: "s" }, { records: [{ stampId: "s", acquiredAt: "" }] })).toBe(
      "CLAIMED",
    );
  });

  it("issues a ticket only once for a reward state", () => {
    const reward = { id: "reward" } as Reward;
    const state: RewardState = { rewardId: "reward", status: "CONSUMED" };
    const issued = issueClaimTicketNumber(reward, state, {
      issuedAt: "2026-01-01T00:00:00.000Z",
      sequence: 3,
    });
    expect(issued.claimTicketNumber).toMatch(/^SR-[A-Z0-9]{7}$/u);
    expect(issueClaimTicketNumber(reward, issued)).toBe(issued);
  });
});
