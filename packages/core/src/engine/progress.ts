import type { PublicSpotItem, RallyConfig, StampRallyState } from "../domain/index.js";
export interface StampRallyProgress {
  readonly acquired: number;
  readonly total: number;
  readonly percentage: number;
  readonly isCompleted: boolean;
  readonly nextAvailableSpots: ReadonlyArray<PublicSpotItem>;
}
export function calculateProgress(state: StampRallyState, config: RallyConfig): StampRallyProgress {
  const ids = new Set(config.spots.map((spot) => spot.id));
  const acquired = new Set(
    state.records.map((record) => record.stampId).filter((id) => ids.has(id)),
  );
  const remaining = config.spots.filter((spot) => !acquired.has(spot.id));
  return {
    acquired: acquired.size,
    total: config.spots.length,
    percentage: config.spots.length === 0 ? 0 : (acquired.size / config.spots.length) * 100,
    isCompleted: config.spots.length > 0 && acquired.size === config.spots.length,
    nextAvailableSpots: [...remaining].sort((left, right) => left.orderIndex - right.orderIndex),
  };
}
