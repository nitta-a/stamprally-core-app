import { verifyPasscode } from "../detectors/index.js";
import type {
  AdminRallyConfig,
  Result,
  Reward,
  RewardState,
  StampError,
  StampRallyState,
  StampRecord,
  VerificationContext,
} from "../domain/index.js";
import { evaluateConditionDetailed } from "./evaluate.js";
import { createUniqueClaimTicketNumber } from "./rewards.js";

export type RewardConsumeError =
  | {
      readonly code: "NOT_AVAILABLE" | "ALREADY_CONSUMED" | "OUT_OF_STOCK" | "REWARD_NOT_FOUND";
      readonly rewardId: string;
    }
  | { readonly code: "INVALID_PASSCODE"; readonly rewardId: string; readonly message: string }
  | { readonly code: "EXPIRED"; readonly rewardId: string }
  | { readonly code: "USER_LIMIT_REACHED"; readonly rewardId: string };
export interface ConsumeRewardParams {
  readonly reward: Reward;
  readonly currentState: RewardState;
  readonly inputPasscode?: string;
  readonly staffId?: string;
  readonly now: string;
  readonly userRedemptionCount?: number;
}
export type ConsumeResult = Result<RewardState, RewardConsumeError>;
export function reconcileRewardStates(
  rewards: ReadonlyArray<Reward>,
  currentStates: ReadonlyArray<RewardState>,
  acquiredStampCount: number,
  now: string,
): ReadonlyArray<RewardState> {
  const states = new Map(currentStates.map((state) => [state.rewardId, state]));
  return rewards.map((reward) => {
    const current = states.get(reward.id);
    if (current?.status === "CONSUMED" || current?.status === "EXPIRED") return current;
    if (reward.validUntil !== undefined && Date.parse(reward.validUntil) <= Date.parse(now))
      return { rewardId: reward.id, status: "EXPIRED" };
    if (reward.stockLimit !== undefined && (current?.redeemedCount ?? 0) >= reward.stockLimit)
      return { rewardId: reward.id, status: "EXPIRED" };
    if (acquiredStampCount >= reward.requiredStampCount)
      return {
        rewardId: reward.id,
        status: "AVAILABLE",
        ...(current?.unlockedAt === undefined
          ? { unlockedAt: now }
          : { unlockedAt: current.unlockedAt }),
      };
    return { rewardId: reward.id, status: "LOCKED" };
  });
}
export function consumeReward(params: ConsumeRewardParams): ConsumeResult {
  const { reward, currentState } = params;
  if (currentState.status === "CONSUMED")
    return { ok: false, error: { code: "ALREADY_CONSUMED", rewardId: reward.id } };
  if (currentState.status !== "AVAILABLE")
    return { ok: false, error: { code: "NOT_AVAILABLE", rewardId: reward.id } };
  if (reward.validUntil !== undefined && Date.parse(reward.validUntil) <= Date.parse(params.now))
    return { ok: false, error: { code: "EXPIRED", rewardId: reward.id } };
  if (reward.stockLimit !== undefined && (currentState.redeemedCount ?? 0) >= reward.stockLimit)
    return { ok: false, error: { code: "OUT_OF_STOCK", rewardId: reward.id } };
  if (
    reward.userClaimLimit !== undefined &&
    (params.userRedemptionCount ?? currentState.userRedemptionCount ?? 0) >= reward.userClaimLimit
  )
    return { ok: false, error: { code: "USER_LIMIT_REACHED", rewardId: reward.id } };
  if (reward.redemptionMethod === "staff_passcode") {
    if (
      reward.staffPasscode === undefined ||
      !verifyPasscode(params.inputPasscode ?? "", { code: reward.staffPasscode }).success
    )
      return {
        ok: false,
        error: {
          code: "INVALID_PASSCODE",
          rewardId: reward.id,
          message: "The passcode is invalid.",
        },
      };
  }
  if (reward.redemptionMethod === "view_only") return { ok: true, value: currentState };
  return {
    ok: true,
    value: {
      ...currentState,
      status: "CONSUMED",
      consumedAt: params.now,
      claimTicketNumber: createUniqueClaimTicketNumber(reward.id, params.now),
      redeemedCount: (currentState.redeemedCount ?? 0) + 1,
      ...(params.staffId === undefined ? {} : { consumedByStaffId: params.staffId }),
    },
  };
}

export interface ProcessStampValue {
  readonly nextState: StampRallyState;
  readonly events: ReadonlyArray<{ readonly type: "stampAcquired"; readonly record: StampRecord }>;
}
export function processStamp(
  state: StampRallyState,
  config: AdminRallyConfig,
  spotId: string,
  context: VerificationContext,
  now: string,
): Result<ProcessStampValue, StampError> {
  const spot = config.spots.find((item) => item.id === spotId);
  if (spot === undefined) return { ok: false, error: { code: "SPOT_NOT_FOUND", spotId } };
  if (state.records.some((record) => record.stampId === spotId))
    return { ok: false, error: { code: "STAMP_ALREADY_ACQUIRED", spotId } };
  const acquired = new Set(state.records.map((record) => record.stampId));
  if (spot.prerequisites?.some((id) => !acquired.has(id)))
    return { ok: false, error: { code: "PREREQUISITES_NOT_MET", spotId } };
  for (const condition of spot.conditions) {
    if (condition.type === "custom" || !evaluateConditionDetailed(condition, context).ok)
      return {
        ok: false,
        error:
          condition.type === "custom"
            ? {
                code: "CUSTOM_VALIDATION_FAILED",
                spotId,
                message: "Custom validation requires an async validator.",
              }
            : { code: "INVALID_PROOF", spotId },
      };
  }
  const record: StampRecord = { stampId: spotId, acquiredAt: now };
  const records = [...state.records, record];
  const rewards = reconcileRewardStates(config.rewards, state.rewards, records.length, now);
  return {
    ok: true,
    value: {
      nextState: { ...state, records, rewards, updatedAt: now },
      events: [{ type: "stampAcquired", record }],
    },
  };
}
