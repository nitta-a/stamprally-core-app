import type { RallyConfig, StampDefinition, StampRallyState } from "../domain/index.js";
import { getOrderedStamps } from "./order.js";

export interface StampRallyProgress {
  readonly acquired: number;
  readonly total: number;
  readonly percentage: number;
  readonly isCompleted: boolean;
  /** @deprecated Use isCompleted instead. */
  readonly isComplete: boolean;
  readonly nextAvailableStamps: ReadonlyArray<StampDefinition>;
}

export function calculateProgress(state: StampRallyState, config: RallyConfig): StampRallyProgress {
  const configuredStampIds = new Set(config.stamps.map((stamp) => stamp.id));
  const acquiredStampIds = new Set(
    state.records
      .map((record) => record.stampId)
      .filter((stampId) => configuredStampIds.has(stampId)),
  );
  const total = config.stamps.length;
  const acquired = acquiredStampIds.size;
  const isCompleted = total > 0 && acquired === total;

  const remainingStamps = config.stamps.filter((stamp) => !acquiredStampIds.has(stamp.id));
  const nextAvailableStamps =
    config.isSequential === true
      ? getOrderedStamps(config)
          .filter((stamp) => !acquiredStampIds.has(stamp.id))
          .slice(0, 1)
      : remainingStamps;

  return {
    acquired,
    total,
    percentage: total === 0 ? 0 : (acquired / total) * 100,
    isCompleted,
    isComplete: isCompleted,
    nextAvailableStamps,
  };
}
