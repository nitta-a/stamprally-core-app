import type { StampCondition, VerificationContext } from "../domain/index.js";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function calculateDistanceMeters(
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

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function assertNever(value: never): never {
  throw new Error(`Unexpected condition: ${JSON.stringify(value)}`);
}

export function evaluateCondition(
  condition: StampCondition,
  context: VerificationContext,
): boolean {
  switch (condition.type) {
    case "instant":
      return context.type === "instant";
    case "token":
      return context.type === "token" && context.token === condition.token;
    case "geo":
      return (
        context.type === "geo" &&
        calculateDistanceMeters(
          condition.latitude,
          condition.longitude,
          context.currentLatitude,
          context.currentLongitude,
        ) <= condition.radiusMeters
      );
    case "composite": {
      if (context.type !== "composite" || condition.conditions.length !== context.contexts.length) {
        return false;
      }

      const results = condition.conditions.map((childCondition, index) => {
        const childContext = context.contexts[index];
        return childContext === undefined ? false : evaluateCondition(childCondition, childContext);
      });

      return condition.operator === "AND" ? results.every(Boolean) : results.some(Boolean);
    }
    default:
      return assertNever(condition);
  }
}
