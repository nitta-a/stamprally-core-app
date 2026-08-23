import type {
  RallyConfig,
  Result,
  StampDefinition,
  StampError,
  StampRallyState,
  StampRecord,
  VerificationContext,
} from "../domain/index.js";
import { evaluateCondition } from "./evaluate.js";

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

interface OrderedStamp {
  readonly stamp: StampDefinition;
  readonly index: number;
}

function getSequentialStamps(config: RallyConfig): ReadonlyArray<StampDefinition> {
  return config.stamps
    .map((stamp, index): OrderedStamp => ({ stamp, index }))
    .sort((left, right) => {
      const orderDifference =
        (left.stamp.order ?? Number.POSITIVE_INFINITY) -
        (right.stamp.order ?? Number.POSITIVE_INFINITY);
      return orderDifference === 0 ? left.index - right.index : orderDifference;
    })
    .map(({ stamp }) => stamp);
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
    const expectedStamp = getSequentialStamps(config).find(
      (stamp) => !acquiredStampIds.has(stamp.id),
    );
    if (expectedStamp !== undefined && expectedStamp.id !== targetStampId) {
      return {
        ok: false,
        error: {
          code: "STAMP_OUT_OF_ORDER",
          stampId: targetStampId,
          expectedStampId: expectedStamp.id,
        },
      };
    }
  }

  if (!evaluateCondition(targetStamp.condition, context)) {
    return {
      ok: false,
      error: { code: "CONDITION_NOT_MET", stampId: targetStampId },
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
