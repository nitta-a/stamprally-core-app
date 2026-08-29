import type { AdminRallyConfig } from "@stamprally/core";
import type { CheckInRequest, ClaimRewardRequest, SyncProgressRequest } from "./index.js";

export interface RequestValidationError {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}
export type RequestValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly errors: ReadonlyArray<RequestValidationError> };

export class RequestValidationException extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly errors: ReadonlyArray<RequestValidationError>;

  constructor(errors: ReadonlyArray<RequestValidationError>) {
    super("Request validation failed.");
    this.name = "RequestValidationException";
    this.errors = errors;
  }
}

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
  if (value.now !== undefined && !dateInput(value.now))
    return errors({
      path: "now",
      message: "now must be an ISO 8601 date or positive timestamp.",
      code: "INVALID_DATE",
    });
  return { success: true, data: value as unknown as ClaimRewardRequest };
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function identityErrors(value: { readonly userId?: string; readonly anonymousSessionId?: string }) {
  const result: RequestValidationError[] = [];
  if (value.userId === undefined && value.anonymousSessionId === undefined)
    result.push({
      path: "userId",
      message: "An authenticated userId or anonymousSessionId is required.",
      code: "REQUIRED",
    });
  if (value.userId !== undefined && !nonEmpty(value.userId))
    result.push({ path: "userId", message: "userId must be non-empty.", code: "INVALID_TYPE" });
  if (value.anonymousSessionId !== undefined && !uuid(value.anonymousSessionId))
    result.push({
      path: "anonymousSessionId",
      message: "anonymousSessionId must be a UUID v4.",
      code: "INVALID_FORMAT",
    });
  if (
    value.userId !== undefined &&
    value.anonymousSessionId !== undefined &&
    value.userId !== value.anonymousSessionId
  )
    result.push({
      path: "anonymousSessionId",
      message: "userId and anonymousSessionId must identify the same session.",
      code: "IDENTITY_MISMATCH",
    });
  return result;
}

function directErrors(
  value: unknown,
  config: AdminRallyConfig,
  kind: "check-in" | "claim",
): ReadonlyArray<RequestValidationError> {
  const validated =
    kind === "check-in" ? validateCheckInRequest(value) : validateClaimRewardRequest(value);
  if (!validated.success) return validated.errors;
  const errors: RequestValidationError[] = [];
  if (validated.data.rallyId !== config.id)
    errors.push({
      path: "rallyId",
      message: "The rally does not match this server.",
      code: "INVALID_VALUE",
    });
  const resourceId =
    kind === "check-in"
      ? (validated.data as CheckInRequest).spotId
      : (validated.data as ClaimRewardRequest).rewardId;
  const exists =
    kind === "check-in"
      ? config.spots.some((spot) => spot.id === resourceId)
      : config.rewards.some((reward) => reward.id === resourceId);
  if (!exists)
    errors.push({
      path: kind === "check-in" ? "spotId" : "rewardId",
      message: `${kind === "check-in" ? "Spot" : "Reward"} was not found.`,
      code: kind === "check-in" ? "SPOT_NOT_FOUND" : "REWARD_NOT_FOUND",
    });
  errors.push(...identityErrors(validated.data));
  return errors;
}

export function assertValidCheckInParams(
  value: unknown,
  config: AdminRallyConfig,
): asserts value is CheckInRequest & { readonly userId: string } {
  const errors = directErrors(value, config, "check-in");
  if (errors.length > 0) throw new RequestValidationException(errors);
}

export function assertValidClaimParams(
  value: unknown,
  config: AdminRallyConfig,
): asserts value is ClaimRewardRequest & { readonly userId: string } {
  const errors = directErrors(value, config, "claim");
  if (errors.length > 0) throw new RequestValidationException(errors);
}

export function assertValidSyncParams(
  value: unknown,
  config: AdminRallyConfig,
): asserts value is { readonly rallyId: string; readonly userId: string } {
  const validated = validateSyncRequest(value);
  const errors = validated.success
    ? [
        ...(validated.data.rallyId !== config.id
          ? [
              {
                path: "rallyId",
                message: "The rally does not match this server.",
                code: "INVALID_VALUE",
              },
            ]
          : []),
      ]
    : [...validated.errors];
  if (validated.success) errors.push(...identityErrors(validated.data));
  if (errors.length > 0) throw new RequestValidationException(errors);
}

export function validateSyncRequest(value: unknown): RequestValidationResult<{
  readonly rallyId: string;
  readonly userId?: string;
  readonly anonymousSessionId?: string;
  readonly operations?: SyncProgressRequest["operations"];
}> {
  const required = requiredErrors(value, ["rallyId"]);
  if (required.length > 0) return errors(...required);
  if (!record(value))
    return errors({ path: "$", message: "Expected an object.", code: "INVALID_TYPE" });
  if (value.userId !== undefined && !nonEmpty(value.userId))
    return errors({ path: "userId", message: "userId must be non-empty.", code: "INVALID_TYPE" });
  if (value.operations !== undefined) {
    if (!Array.isArray(value.operations))
      return errors({
        path: "operations",
        message: "operations must be an array.",
        code: "INVALID_TYPE",
      });
    const operationErrors: RequestValidationError[] = [];
    value.operations.forEach((operation, index) => {
      const path = `operations[${index}]`;
      if (!record(operation)) {
        operationErrors.push({
          path,
          message: "Expected an operation object.",
          code: "INVALID_TYPE",
        });
        return;
      }
      if (operation.kind !== "checkIn" && operation.kind !== "claimReward") {
        operationErrors.push({
          path: `${path}.kind`,
          message: "Unknown sync operation.",
          code: "INVALID_ENUM",
        });
        return;
      }
      const result =
        operation.kind === "checkIn"
          ? validateCheckInRequest(operation.request)
          : validateClaimRewardRequest(operation.request);
      if (!result.success)
        operationErrors.push(
          ...result.errors.map((error) => ({ ...error, path: `${path}.request.${error.path}` })),
        );
    });
    if (operationErrors.length > 0) return errors(...operationErrors);
  }
  return {
    success: true,
    data: value as {
      readonly rallyId: string;
      readonly userId?: string;
      readonly anonymousSessionId?: string;
      readonly operations?: SyncProgressRequest["operations"];
    },
  };
}
