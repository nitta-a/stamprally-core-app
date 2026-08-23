import type {
  CompositeConditionFailure,
  ConditionMatch,
  ConditionMismatch,
  Result,
  StampCondition,
  VerificationContext,
} from "../domain/index.js";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function calculateDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const latitudeARadians = toRadians(latitudeA);
  const latitudeBRadians = toRadians(latitudeB);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeARadians) * Math.cos(latitudeBRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function contextTypeMismatch(
  conditionType: Exclude<StampCondition["type"], "time_window">,
  expectedContextType: VerificationContext["type"],
  actualContextType: VerificationContext["type"],
): Result<ConditionMatch, ConditionMismatch> {
  return {
    ok: false,
    error: {
      code: "CONDITION_MISMATCH",
      conditionType,
      reason: "CONTEXT_TYPE_MISMATCH",
      expectedContextType,
      actualContextType,
    },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected condition: ${JSON.stringify(value)}`);
}

export function evaluateConditionDetailed(
  condition: StampCondition,
  context: VerificationContext,
  now: string,
): Result<ConditionMatch, ConditionMismatch> {
  switch (condition.type) {
    case "instant":
      return context.type === "instant"
        ? { ok: true, value: { conditionType: "instant" } }
        : contextTypeMismatch("instant", "instant", context.type);
    case "token":
      if (context.type !== "token") {
        return contextTypeMismatch("token", "token", context.type);
      }
      return context.token === condition.token
        ? { ok: true, value: { conditionType: "token" } }
        : {
            ok: false,
            error: {
              code: "CONDITION_MISMATCH",
              conditionType: "token",
              reason: "TOKEN_MISMATCH",
            },
          };
    case "geo": {
      if (context.type !== "geo") {
        return contextTypeMismatch("geo", "geo", context.type);
      }
      if (
        !isValidCoordinate(condition.latitude, condition.longitude) ||
        !isValidCoordinate(context.currentLatitude, context.currentLongitude) ||
        !Number.isFinite(condition.radiusMeters) ||
        condition.radiusMeters < 0
      ) {
        return {
          ok: false,
          error: {
            code: "CONDITION_MISMATCH",
            conditionType: "geo",
            reason: "INVALID_GEO_INPUT",
          },
        };
      }

      const distanceMeters = calculateDistanceMeters(
        condition.latitude,
        condition.longitude,
        context.currentLatitude,
        context.currentLongitude,
      );
      if (distanceMeters <= condition.radiusMeters) {
        return { ok: true, value: { conditionType: "geo", distanceMeters } };
      }
      return {
        ok: false,
        error: {
          code: "CONDITION_MISMATCH",
          conditionType: "geo",
          reason: "OUTSIDE_RADIUS",
          distanceMeters,
          radiusMeters: condition.radiusMeters,
          differenceMeters: distanceMeters - condition.radiusMeters,
        },
      };
    }
    case "composite": {
      if (context.type !== "composite") {
        return contextTypeMismatch("composite", "composite", context.type);
      }
      if (condition.conditions.length !== context.contexts.length) {
        return {
          ok: false,
          error: {
            code: "CONDITION_MISMATCH",
            conditionType: "composite",
            reason: "CONTEXT_LENGTH_MISMATCH",
            expectedCount: condition.conditions.length,
            actualCount: context.contexts.length,
          },
        };
      }

      const failures: CompositeConditionFailure[] = [];
      let matchedCount = 0;
      for (const [index, childCondition] of condition.conditions.entries()) {
        const childContext = context.contexts[index];
        if (childContext === undefined) continue;
        const result = evaluateConditionDetailed(childCondition, childContext, now);
        if (result.ok) matchedCount += 1;
        else failures.push({ index, error: result.error });
      }

      if (condition.operator === "AND" && failures.length === 0) {
        return { ok: true, value: { conditionType: "composite" } };
      }
      if (condition.operator === "OR" && matchedCount > 0) {
        return { ok: true, value: { conditionType: "composite" } };
      }
      return {
        ok: false,
        error: {
          code: "CONDITION_MISMATCH",
          conditionType: "composite",
          reason: condition.operator === "AND" ? "AND_CHILD_FAILED" : "OR_ALL_FAILED",
          failures,
        },
      };
    }
    case "time_window": {
      const startsAt = Date.parse(condition.startsAt);
      const endsAt = Date.parse(condition.endsAt);
      const currentTime = Date.parse(now);
      if (!Number.isFinite(currentTime)) {
        return {
          ok: false,
          error: {
            code: "CONDITION_MISMATCH",
            conditionType: "time_window",
            reason: "INVALID_NOW",
            now,
            startsAt: condition.startsAt,
            endsAt: condition.endsAt,
          },
        };
      }
      if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt > endsAt) {
        return {
          ok: false,
          error: {
            code: "CONDITION_MISMATCH",
            conditionType: "time_window",
            reason: "INVALID_TIME_WINDOW",
            now,
            startsAt: condition.startsAt,
            endsAt: condition.endsAt,
          },
        };
      }
      if (currentTime < startsAt || currentTime > endsAt) {
        return {
          ok: false,
          error: {
            code: "CONDITION_MISMATCH",
            conditionType: "time_window",
            reason: currentTime < startsAt ? "BEFORE_START" : "AFTER_END",
            now,
            startsAt: condition.startsAt,
            endsAt: condition.endsAt,
          },
        };
      }
      const childResult = evaluateConditionDetailed(condition.condition, context, now);
      return childResult.ok ? { ok: true, value: { conditionType: "time_window" } } : childResult;
    }
    default:
      return assertNever(condition);
  }
}

export function evaluateCondition(
  condition: StampCondition,
  context: VerificationContext,
  now?: string,
): boolean {
  return evaluateConditionDetailed(condition, context, now ?? "").ok;
}
