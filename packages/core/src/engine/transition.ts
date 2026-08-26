import { verifyPasscode } from "../detectors/index.js";
import type {
  RallyConfig,
  Result,
  RewardItem,
  RewardState,
  StampError,
  StampRallyState,
  StampRecord,
  VerificationContext,
} from "../domain/index.js";
import { evaluateConditionDetailed } from "./evaluate.js";
import { getOrderedStamps } from "./order.js";

export type StampRallyEvent =
  | {
      readonly type: "stampAcquired";
      readonly record: StampRecord;
    }
  | {
      readonly type: "rallyCompleted";
      readonly rallyId: string;
      readonly completedAt: string;
    }
  | {
      readonly type: "rewardUnlocked";
      readonly rewardId: string;
      readonly unlockedAt: string;
    };

export interface ProcessStampValue {
  readonly nextState: StampRallyState;
  readonly events: ReadonlyArray<StampRallyEvent>;
}

export type RewardConsumeError =
  | { readonly code: "NOT_AVAILABLE"; readonly rewardId: string }
  | { readonly code: "ALREADY_CONSUMED"; readonly rewardId: string }
  | {
      readonly code: "INVALID_PASSCODE";
      readonly rewardId: string;
      readonly message: string;
    }
  | { readonly code: "EXPIRED"; readonly rewardId: string }
  | { readonly code: "OUT_OF_STOCK"; readonly rewardId: string }
  | { readonly code: "USER_LIMIT_REACHED"; readonly rewardId: string }
  | { readonly code: "REWARD_NOT_FOUND"; readonly rewardId: string };

export interface ConsumeRewardParams {
  readonly reward: RewardItem;
  readonly currentState: RewardState;
  readonly inputPasscode?: string;
  readonly staffId?: string;
  readonly now: string;
  readonly userId?: string;
  readonly userRedemptionCount?: number;
}

export type ConsumeResult = Result<RewardState, RewardConsumeError>;

export function reconcileRewardStates(
  rewards: ReadonlyArray<RewardItem>,
  currentStates: ReadonlyArray<RewardState>,
  acquiredStampCount: number,
  now: string,
): ReadonlyArray<RewardState> {
  const statesById = new Map(currentStates.map((state) => [state.rewardId, state]));

  return rewards.map((reward) => {
    const current = statesById.get(reward.id);
    if (current?.status === "CONSUMED" || current?.status === "EXPIRED") {
      return current;
    }

    if (reward.validUntil !== undefined && Date.parse(reward.validUntil) <= Date.parse(now)) {
      return { rewardId: reward.id, status: "EXPIRED" };
    }

    if (reward.maxStock !== undefined && (current?.redeemedCount ?? 0) >= reward.maxStock) {
      return {
        rewardId: reward.id,
        status: "EXPIRED",
        ...(current?.claimTicketNumber === undefined
          ? {}
          : { claimTicketNumber: current.claimTicketNumber }),
      };
    }

    if (acquiredStampCount >= reward.requiredStampCount) {
      if (current?.status === "AVAILABLE") return current;
      return {
        rewardId: reward.id,
        status: "AVAILABLE",
        unlockedAt: current?.unlockedAt ?? now,
        ...(current?.claimTicketNumber === undefined
          ? {}
          : { claimTicketNumber: current.claimTicketNumber }),
      };
    }

    if (current?.status === "LOCKED" && current.unlockedAt === undefined) return current;
    return { rewardId: reward.id, status: "LOCKED" };
  });
}

export function consumeReward(params: ConsumeRewardParams): ConsumeResult {
  const { reward, currentState } = params;

  if (currentState.status === "CONSUMED") {
    return {
      ok: false,
      error: { code: "ALREADY_CONSUMED", rewardId: reward.id },
    };
  }

  if (currentState.status !== "AVAILABLE") {
    return {
      ok: false,
      error: { code: "NOT_AVAILABLE", rewardId: reward.id },
    };
  }

  if (reward.validUntil !== undefined && Date.parse(reward.validUntil) <= Date.parse(params.now)) {
    return { ok: false, error: { code: "EXPIRED", rewardId: reward.id } };
  }
  if (reward.maxStock !== undefined && (currentState.redeemedCount ?? 0) >= reward.maxStock) {
    return { ok: false, error: { code: "OUT_OF_STOCK", rewardId: reward.id } };
  }
  if (
    reward.limitPerUser !== undefined &&
    (params.userRedemptionCount ?? currentState.userRedemptionCount ?? 0) >= reward.limitPerUser
  ) {
    return { ok: false, error: { code: "USER_LIMIT_REACHED", rewardId: reward.id } };
  }

  if (reward.redemptionMethod === "staff_passcode") {
    const passcodeResult =
      reward.staffPasscode === undefined
        ? null
        : verifyPasscode(params.inputPasscode ?? "", { passcode: reward.staffPasscode });
    if (passcodeResult === null || !passcodeResult.success) {
      return {
        ok: false,
        error: {
          code: "INVALID_PASSCODE",
          rewardId: reward.id,
          message: passcodeResult?.message ?? "The passcode is invalid.",
        },
      };
    }
  }

  if (reward.redemptionMethod === "view_only") {
    return { ok: true, value: currentState };
  }

  return {
    ok: true,
    value: {
      ...currentState,
      status: "CONSUMED",
      consumedAt: params.now,
      ...(reward.maxStock !== undefined ||
      params.userId !== undefined ||
      params.userRedemptionCount !== undefined
        ? { redeemedCount: (currentState.redeemedCount ?? 0) + 1 }
        : {}),
      ...(params.userId === undefined
        ? {}
        : { userRedemptionCount: (currentState.userRedemptionCount ?? 0) + 1 }),
      ...(params.staffId === undefined ? {} : { consumedByStaffId: params.staffId }),
    },
  };
}

export function processStamp(
  state: StampRallyState,
  config: RallyConfig,
  targetStampId: string,
  context: VerificationContext,
  now: string,
): Result<ProcessStampValue, StampError> {
  const targetStamp = config.stamps.find((stamp) => stamp.id === targetStampId);
  if (targetStamp === undefined) {
    return { ok: false, error: { code: "STAMP_NOT_FOUND", stampId: targetStampId } };
  }

  const acquiredStampIds = new Set(state.records.map((record) => record.stampId));
  if (acquiredStampIds.has(targetStampId)) {
    return {
      ok: false,
      error: { code: "STAMP_ALREADY_ACQUIRED", stampId: targetStampId },
    };
  }

  if (config.isSequential === true) {
    const expectedStamp = getOrderedStamps(config).find((stamp) => !acquiredStampIds.has(stamp.id));
    if (expectedStamp !== undefined && expectedStamp.id !== targetStampId) {
      return {
        ok: false,
        error: {
          code: "INVALID_ORDER",
          stampId: targetStampId,
          expectedStampId: expectedStamp.id,
        },
      };
    }
  }

  const conditionResult = evaluateConditionDetailed(targetStamp.condition, context, now);
  if (!conditionResult.ok) {
    return {
      ok: false,
      error: {
        code: "CONDITION_MISMATCH",
        stampId: targetStampId,
        mismatch: conditionResult.error,
      },
    };
  }

  const record: StampRecord = { stampId: targetStampId, acquiredAt: now };
  const nextRecords = [...state.records, record];
  const nextRewards =
    config.rewards === undefined && state.rewards === undefined
      ? undefined
      : reconcileRewardStates(config.rewards ?? [], state.rewards ?? [], nextRecords.length, now);
  const nextState: StampRallyState = {
    ...state,
    records: nextRecords,
    ...(nextRewards === undefined ? {} : { rewards: nextRewards }),
    updatedAt: now,
  };
  const events: StampRallyEvent[] = [{ type: "stampAcquired", record }];
  if (nextRewards !== undefined) {
    for (const rewardState of nextRewards) {
      const previous = state.rewards?.find((item) => item.rewardId === rewardState.rewardId);
      if (rewardState.status === "AVAILABLE" && previous?.status !== "AVAILABLE") {
        events.push({ type: "rewardUnlocked", rewardId: rewardState.rewardId, unlockedAt: now });
      }
    }
  }

  const completed =
    config.stamps.length > 0 &&
    config.stamps.every((stamp) => nextState.records.some((item) => item.stampId === stamp.id));

  if (completed) {
    events.push({ type: "rallyCompleted", rallyId: config.id, completedAt: now });
  }

  return { ok: true, value: { nextState, events } };
}
