import type {
  CheckInCondition,
  ConditionMatch,
  ConditionMismatch,
  Result,
  SpotItem,
  SpotStatus,
  UserRallyState,
  VerificationContext,
} from "../domain/index.js";

const EARTH_RADIUS_METERS = 6_371_000;
export function calculateDistanceMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const radians = (value: number): number => (value * Math.PI) / 180;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, value)));
}
function mismatch(
  conditionType: CheckInCondition["type"],
  reason: ConditionMismatch["reason"],
  extra: Partial<ConditionMismatch> = {},
): Result<ConditionMatch, ConditionMismatch> {
  return { ok: false, error: { code: "CONDITION_MISMATCH", conditionType, reason, ...extra } };
}
export function evaluateConditionDetailed(
  condition: CheckInCondition,
  context: VerificationContext,
): Result<ConditionMatch, ConditionMismatch> {
  switch (condition.type) {
    case "qr":
      return context.type === "qr" && context.token === condition.secretToken
        ? { ok: true, value: { conditionType: "qr" } }
        : mismatch("qr", "INVALID_PROOF");
    case "passcode":
      return context.type === "passcode" &&
        (condition.caseSensitive === false
          ? context.code.toLocaleLowerCase() === condition.code.toLocaleLowerCase()
          : context.code === condition.code)
        ? { ok: true, value: { conditionType: "passcode" } }
        : mismatch("passcode", "INVALID_PROOF");
    case "nfc":
      return context.type === "nfc" && context.tagId === condition.tagId
        ? { ok: true, value: { conditionType: "nfc" } }
        : mismatch("nfc", "INVALID_PROOF");
    case "custom":
      return mismatch("custom", "VALIDATOR_FAILED");
    case "gps": {
      if (
        !Number.isFinite(condition.latitude) ||
        !Number.isFinite(condition.longitude) ||
        !Number.isFinite(condition.radiusMeters) ||
        condition.radiusMeters < 0 ||
        context.type !== "gps" ||
        !Number.isFinite(context.latitude) ||
        !Number.isFinite(context.longitude)
      )
        return mismatch("gps", "INVALID_GEO_INPUT");
      const distanceMeters = calculateDistanceMeters(
        condition.latitude,
        condition.longitude,
        context.latitude,
        context.longitude,
      );
      return distanceMeters <= condition.radiusMeters
        ? { ok: true, value: { conditionType: "gps", distanceMeters } }
        : mismatch("gps", "OUTSIDE_RADIUS", {
            distanceMeters,
            radiusMeters: condition.radiusMeters,
          });
    }
  }
}
export function evaluateCondition(
  condition: CheckInCondition,
  context: VerificationContext,
): boolean {
  return evaluateConditionDetailed(condition, context).ok;
}

/** Derives a viewer-safe spot status without changing the supplied state. */
export function evaluateSpotStatus(
  spot: Pick<SpotItem, "id" | "prerequisites">,
  state: Pick<UserRallyState, "records">,
  options: { readonly verifying?: boolean } = {},
): SpotStatus {
  if (options.verifying === true) return "VERIFYING";
  if (state.records.some((record) => record.stampId === spot.id)) return "CLAIMED";
  const acquired = new Set(state.records.map((record) => record.stampId));
  if (spot.prerequisites?.some((prerequisite) => !acquired.has(prerequisite))) return "LOCKED";
  return "UNCLAIMED";
}

export const getSpotStatus = evaluateSpotStatus;
