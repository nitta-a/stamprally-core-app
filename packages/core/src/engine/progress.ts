import type { RallyConfig, StampRallyState } from "../domain/index.js";

export interface StampRallyProgress {
  readonly acquired: number;
  readonly total: number;
  readonly percentage: number;
  readonly isComplete: boolean;
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

  if (total === 0) {
    return { acquired: 0, total: 0, percentage: 0, isComplete: false };
  }

  return {
    acquired,
    total,
    percentage: (acquired / total) * 100,
    isComplete: acquired === total,
  };
}
