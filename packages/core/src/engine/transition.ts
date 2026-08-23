import type {
  RallyConfig,
  Result,
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
    };

export interface ProcessStampValue {
  readonly nextState: StampRallyState;
  readonly events: ReadonlyArray<StampRallyEvent>;
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
  const nextState: StampRallyState = {
    ...state,
    records: [...state.records, record],
    updatedAt: now,
  };
  const events: StampRallyEvent[] = [{ type: "stampAcquired", record }];

  const completed =
    config.stamps.length > 0 &&
    config.stamps.every((stamp) => nextState.records.some((item) => item.stampId === stamp.id));

  if (completed) {
    events.push({ type: "rallyCompleted", rallyId: config.id, completedAt: now });
  }

  return { ok: true, value: { nextState, events } };
}
