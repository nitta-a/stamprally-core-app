import type {
  GeoCoordinates,
  PublicRallyConfig,
  PublicSpotItem,
  StampRallyState,
} from "../domain/index.js";
import type { AvailabilityStatus } from "./availability.js";
import { evaluateRallyAvailability, evaluateSpotAvailability } from "./availability.js";
import { calculateDistanceMeters } from "./evaluate.js";
import { calculateProgress } from "./progress.js";
import { calculateRewardProgress } from "./rewardProgress.js";

export type NextSpotStrategy = "order" | "nearest" | "reward_goal";
export type AvailabilitySuggestionMode = "open_first" | "exclude_closed";

export interface NextSpotSuggestion {
  readonly spot: PublicSpotItem;
  readonly distanceMeters?: number;
  readonly availabilityStatus?: AvailabilityStatus;
}

export interface NextSpotSuggestionOptions {
  readonly strategy?: NextSpotStrategy;
  readonly currentLocation?: GeoCoordinates;
  readonly limit?: number;
  readonly rewardId?: string;
  readonly now?: string;
  readonly availability?: AvailabilitySuggestionMode;
}

export function getNextSpotSuggestions(
  state: StampRallyState,
  config: PublicRallyConfig,
  options: NextSpotSuggestionOptions = {},
): ReadonlyArray<NextSpotSuggestion> {
  const rallyIsOpen =
    options.now === undefined ||
    evaluateRallyAvailability(config.availability, options.now).status === "OPEN";
  let suggestions = (rallyIsOpen ? calculateProgress(state, config).nextAvailableSpots : []).map(
    (spot) => ({
      spot,
      ...(options.currentLocation === undefined || spot.location === undefined
        ? {}
        : { distanceMeters: calculateDistanceMeters(options.currentLocation, spot.location) }),
      ...(options.now === undefined
        ? {}
        : { availabilityStatus: evaluateSpotAvailability(spot.availability, options.now).status }),
      rewardRequired: false,
    }),
  );
  if (options.strategy === "reward_goal" && options.rewardId !== undefined) {
    const progress = calculateRewardProgress(options.rewardId, state, config);
    if (progress !== undefined) {
      const required = new Set(progress.missingStampIds);
      suggestions = suggestions.map((suggestion) => ({
        ...suggestion,
        rewardRequired: required.has(suggestion.spot.id),
      }));
    }
  }
  if (options.availability === "exclude_closed")
    suggestions = suggestions.filter(
      ({ availabilityStatus }) => availabilityStatus === undefined || availabilityStatus === "OPEN",
    );
  const ordered = [...suggestions].sort((left, right) => {
    if (options.availability !== undefined) {
      const priority = (status: string | undefined): number =>
        status === "OPEN" ? 0 : status === "UPCOMING" ? 1 : status === undefined ? 0 : 2;
      const byAvailability = priority(left.availabilityStatus) - priority(right.availabilityStatus);
      if (byAvailability !== 0) return byAvailability;
    }
    if (options.strategy === "reward_goal" && left.rewardRequired !== right.rewardRequired)
      return left.rewardRequired ? -1 : 1;
    if (options.strategy !== "nearest" || options.currentLocation === undefined) {
      return (
        left.spot.orderIndex - right.spot.orderIndex || left.spot.id.localeCompare(right.spot.id)
      );
    }
    if (left.distanceMeters === undefined && right.distanceMeters === undefined) {
      return (
        left.spot.orderIndex - right.spot.orderIndex || left.spot.id.localeCompare(right.spot.id)
      );
    }
    if (left.distanceMeters === undefined) return 1;
    if (right.distanceMeters === undefined) return -1;
    return (
      left.distanceMeters - right.distanceMeters ||
      left.spot.orderIndex - right.spot.orderIndex ||
      left.spot.id.localeCompare(right.spot.id)
    );
  });
  return options.limit === undefined
    ? ordered.map(({ rewardRequired: _required, ...suggestion }) => suggestion)
    : ordered
        .slice(0, Math.max(0, options.limit))
        .map(({ rewardRequired: _required, ...suggestion }) => suggestion);
}
