import type { PublicSpotItem, RallyConfig, StampRallyState } from "../domain/index.js";
export interface StampRallyProgress {
  readonly acquired: number;
  readonly total: number;
  readonly percentage: number;
  readonly isCompleted: boolean;
  readonly completionAcquired: number;
  readonly completionRequired: number;
  readonly completionPercentage: number;
  readonly nextAvailableSpots: ReadonlyArray<PublicSpotItem>;
}
export function calculateProgress(state: StampRallyState, config: RallyConfig): StampRallyProgress {
  const ids = new Set(config.spots.map((spot) => spot.id));
  const acquired = new Set(
    state.records.map((record) => record.stampId).filter((id) => ids.has(id)),
  );
  const remaining = config.spots.filter(
    (spot) =>
      !acquired.has(spot.id) &&
      (spot.prerequisites === undefined || spot.prerequisites.every((id) => acquired.has(id))),
  );
  const condition = config.completion?.condition ?? { type: "all_spots" as const };
  const completionRequired =
    condition.type === "all_spots"
      ? config.spots.length
      : condition.type === "stamp_count"
        ? condition.count
        : condition.stampIds.length;
  const completionAcquired =
    condition.type === "stamps"
      ? condition.stampIds.filter((id) => acquired.has(id)).length
      : Math.min(acquired.size, completionRequired);
  const completionPercentage =
    completionRequired === 0 ? 0 : (completionAcquired / completionRequired) * 100;
  return {
    acquired: acquired.size,
    total: config.spots.length,
    percentage: config.spots.length === 0 ? 0 : (acquired.size / config.spots.length) * 100,
    isCompleted: completionRequired > 0 && completionAcquired >= completionRequired,
    completionAcquired,
    completionRequired,
    completionPercentage,
    nextAvailableSpots: [...remaining].sort((left, right) => left.orderIndex - right.orderIndex),
  };
}
