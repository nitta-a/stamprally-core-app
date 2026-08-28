import type { VerificationContext } from "@stamprally/core";
import type { CheckInRequest, ClaimRewardRequest } from "./index.js";

export interface RequestValidationError {
  readonly path: string;
  readonly message: string;
  readonly code: "invalid_request";
}
export type RequestValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly errors: ReadonlyArray<RequestValidationError> };

function error(path: string, message: string): RequestValidationResult<never> {
  return { success: false, errors: [{ path, message, code: "invalid_request" }] };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function context(value: unknown): value is VerificationContext {
  if (!record(value) || typeof value.type !== "string") return false;
  if (value.type === "qr") return nonEmpty(value.token);
  if (value.type === "passcode") return nonEmpty(value.code);
  if (value.type === "nfc") return nonEmpty(value.tagId);
  if (value.type === "custom") return "value" in value;
  return (
    value.type === "gps" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude)
  );
}
function common(value: unknown, fields: ReadonlyArray<string>): value is Record<string, unknown> {
  if (!record(value)) return false;
  return fields.every((field) => nonEmpty(value[field]));
}

export function validateCheckInRequest(value: unknown): RequestValidationResult<CheckInRequest> {
  if (!common(value, ["rallyId", "spotId", "idempotencyKey"]))
    return error("$", "rallyId, spotId, and idempotencyKey must be non-empty strings.");
  if (!context(value.context))
    return error("context", "context is not a valid verification context.");
  if (value.userId !== undefined && !nonEmpty(value.userId))
    return error("userId", "userId must be non-empty.");
  if (value.now !== undefined && !nonEmpty(value.now))
    return error("now", "now must be non-empty when provided.");
  return { success: true, data: value as unknown as CheckInRequest };
}

export function validateClaimRewardRequest(
  value: unknown,
): RequestValidationResult<ClaimRewardRequest> {
  if (!common(value, ["rallyId", "rewardId", "idempotencyKey"]))
    return error("$", "rallyId, rewardId, and idempotencyKey must be non-empty strings.");
  if (value.userId !== undefined && !nonEmpty(value.userId))
    return error("userId", "userId must be non-empty.");
  if (value.staffPasscode !== undefined && !nonEmpty(value.staffPasscode))
    return error("staffPasscode", "staffPasscode must be non-empty.");
  if (value.staffId !== undefined && !nonEmpty(value.staffId))
    return error("staffId", "staffId must be non-empty.");
  if (value.now !== undefined && !nonEmpty(value.now))
    return error("now", "now must be non-empty when provided.");
  return { success: true, data: value as unknown as ClaimRewardRequest };
}

export function validateSyncRequest(
  value: unknown,
): RequestValidationResult<{ readonly rallyId: string; readonly userId?: string }> {
  if (!common(value, ["rallyId"])) return error("rallyId", "rallyId must be a non-empty string.");
  if (value.userId !== undefined && !nonEmpty(value.userId))
    return error("userId", "userId must be non-empty.");
  return { success: true, data: value as { readonly rallyId: string; readonly userId?: string } };
}
