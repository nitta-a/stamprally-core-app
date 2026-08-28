import type { CheckInRequest, ClaimRewardRequest } from "./index.js";

export interface RequestValidationError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}
export type RequestValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly errors: ReadonlyArray<RequestValidationError> };

function errors(...items: ReadonlyArray<RequestValidationError>): RequestValidationResult<never> {
  return { success: false, errors: items };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function contextErrors(value: unknown): ReadonlyArray<RequestValidationError> {
  if (!record(value) || typeof value.type !== "string")
    return [
      {
        path: "proof",
        message: "proof is not a valid verification context.",
        code: "INVALID_TYPE",
      },
    ];
  if (value.type === "qr" && !nonEmpty(value.token))
    return [
      { path: "proof.token", message: "token must be a non-empty string.", code: "INVALID_TYPE" },
    ];
  if (value.type === "passcode" && !nonEmpty(value.code))
    return [
      { path: "proof.code", message: "code must be a non-empty string.", code: "INVALID_TYPE" },
    ];
  if (value.type === "nfc" && !nonEmpty(value.tagId))
    return [
      { path: "proof.tagId", message: "tagId must be a non-empty string.", code: "INVALID_TYPE" },
    ];
  if (value.type === "custom")
    return "value" in value
      ? []
      : [{ path: "proof.value", message: "value is required.", code: "REQUIRED" }];
  if (value.type === "qr" || value.type === "passcode" || value.type === "nfc") return [];
  if (value.type !== "gps")
    return [{ path: "proof.type", message: "Unknown verification type.", code: "INVALID_ENUM" }];
  const result: RequestValidationError[] = [];
  if (typeof value.latitude !== "number" || !Number.isFinite(value.latitude))
    result.push({
      path: "proof.latitude",
      message: "Latitude must be a finite number.",
      code: "INVALID_TYPE",
    });
  else if (value.latitude < -90 || value.latitude > 90)
    result.push({
      path: "proof.latitude",
      message: "Latitude must be between -90 and 90.",
      code: "INVALID_RANGE",
    });
  if (typeof value.longitude !== "number" || !Number.isFinite(value.longitude))
    result.push({
      path: "proof.longitude",
      message: "Longitude must be a finite number.",
      code: "INVALID_TYPE",
    });
  else if (value.longitude < -180 || value.longitude > 180)
    result.push({
      path: "proof.longitude",
      message: "Longitude must be between -180 and 180.",
      code: "INVALID_RANGE",
    });
  if (
    "radiusMeters" in value &&
    (typeof value.radiusMeters !== "number" ||
      !Number.isFinite(value.radiusMeters) ||
      value.radiusMeters <= 0)
  )
    result.push({
      path: "proof.radiusMeters",
      message: "Radius must be greater than zero.",
      code: "INVALID_RANGE",
    });
  return result;
}
function dateInput(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  if (typeof value !== "string" || value.trim() === "") return false;
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function requiredErrors(
  value: unknown,
  fields: ReadonlyArray<string>,
): ReadonlyArray<RequestValidationError> {
  if (record(value) && fields.every((field) => nonEmpty(value[field]))) return [];
  return fields
    .filter((field) => !record(value) || !nonEmpty(value[field]))
    .map((field) => ({
      path: field,
      message: `${field} must be a non-empty string.`,
      code: "REQUIRED",
    }));
}

export function validateCheckInRequest(value: unknown): RequestValidationResult<CheckInRequest> {
  const required = requiredErrors(value, ["rallyId", "spotId", "idempotencyKey"]);
  if (required.length > 0) return errors(...required);
  if (!record(value))
    return errors({ path: "$", message: "Expected an object.", code: "INVALID_TYPE" });
  const proof = contextErrors(value.context);
  if (proof.length > 0) return errors(...proof);
  if (value.userId !== undefined && !nonEmpty(value.userId))
    return errors({ path: "userId", message: "userId must be non-empty.", code: "INVALID_TYPE" });
  if (value.now !== undefined && !dateInput(value.now))
    return errors({
      path: "now",
      message: "now must be an ISO 8601 date or positive timestamp.",
      code: "INVALID_DATE",
    });
  return { success: true, data: value as unknown as CheckInRequest };
}

export function validateClaimRewardRequest(
  value: unknown,
): RequestValidationResult<ClaimRewardRequest> {
  const required = requiredErrors(value, ["rallyId", "rewardId", "idempotencyKey"]);
  if (required.length > 0) return errors(...required);
  if (!record(value))
    return errors({ path: "$", message: "Expected an object.", code: "INVALID_TYPE" });
  if (value.userId !== undefined && !nonEmpty(value.userId))
    return errors({ path: "userId", message: "userId must be non-empty.", code: "INVALID_TYPE" });
  if (value.staffPasscode !== undefined && !nonEmpty(value.staffPasscode))
    return errors({
      path: "staffPasscode",
      message: "staffPasscode must be non-empty.",
      code: "INVALID_TYPE",
    });
  if (value.staffId !== undefined && !nonEmpty(value.staffId))
    return errors({ path: "staffId", message: "staffId must be non-empty.", code: "INVALID_TYPE" });
  if (value.now !== undefined && !nonEmpty(value.now))
    return errors({
      path: "now",
      message: "now must be an ISO 8601 date or positive timestamp.",
      code: "INVALID_DATE",
    });
  return { success: true, data: value as unknown as ClaimRewardRequest };
}

export function validateSyncRequest(
  value: unknown,
): RequestValidationResult<{ readonly rallyId: string; readonly userId?: string }> {
  const required = requiredErrors(value, ["rallyId"]);
  if (required.length > 0) return errors(...required);
  if (!record(value))
    return errors({ path: "$", message: "Expected an object.", code: "INVALID_TYPE" });
  if (value.userId !== undefined && !nonEmpty(value.userId))
    return errors({ path: "userId", message: "userId must be non-empty.", code: "INVALID_TYPE" });
  return { success: true, data: value as { readonly rallyId: string; readonly userId?: string } };
}
