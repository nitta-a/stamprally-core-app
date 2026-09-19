import type {
  GeoCoordinates,
  PublicRallyConfig,
  PublicSpotItem,
  StampRallyState,
} from "../domain/index.js";
import { calculateDistanceMeters } from "./evaluate.js";
import { calculateProgress } from "./progress.js";

export type NextSpotStrategy = "order" | "nearest";

export interface NextSpotSuggestion {
  readonly spot: PublicSpotItem;
  readonly distanceMeters?: number;
}

export interface NextSpotSuggestionOptions {
  readonly strategy?: NextSpotStrategy;
  readonly currentLocation?: GeoCoordinates;
  readonly limit?: number;
}

export function getNextSpotSuggestions(
  state: StampRallyState,
  config: PublicRallyConfig,
  options: NextSpotSuggestionOptions = {},
): ReadonlyArray<NextSpotSuggestion> {
  const suggestions = calculateProgress(state, config).nextAvailableSpots.map((spot) => ({
    spot,
    ...(options.currentLocation === undefined || spot.location === undefined
      ? {}
      : { distanceMeters: calculateDistanceMeters(options.currentLocation, spot.location) }),
  }));
  const ordered = [...suggestions].sort((left, right) => {
    if (options.strategy !== "nearest" || options.currentLocation === undefined)
      return left.spot.orderIndex - right.spot.orderIndex;
    if (left.distanceMeters === undefined) return 1;
    if (right.distanceMeters === undefined) return -1;
    return left.distanceMeters - right.distanceMeters;
  });
  return options.limit === undefined ? ordered : ordered.slice(0, Math.max(0, options.limit));
}
