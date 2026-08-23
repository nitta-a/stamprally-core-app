import type { Result, VerificationContext } from "../domain/index.js";

export type DetectorKind = "geolocation" | "nfc" | "qr";

export type DetectorErrorCode =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "ABORTED"
  | "READ_FAILED"
  | "INVALID_DATA"
  | "NO_TOKEN";

export interface DetectorError {
  readonly detector: DetectorKind;
  readonly code: DetectorErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type GeoVerificationContext = Extract<VerificationContext, { readonly type: "geo" }>;
export type TokenVerificationContext = Extract<VerificationContext, { readonly type: "token" }>;
export type DetectorResult<T extends VerificationContext> = Result<T, DetectorError>;

export interface PasscodeCondition {
  readonly passcode: string;
  readonly caseSensitive?: boolean;
}

export type CheckInResult =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly reason: "INVALID_PASSCODE";
      readonly message: string;
    };

export function createDetectorError(
  detector: DetectorKind,
  code: DetectorErrorCode,
  message: string,
  cause?: unknown,
): DetectorError {
  return cause === undefined ? { detector, code, message } : { detector, code, message, cause };
}

export function mapBrowserError(detector: DetectorKind, error: unknown): DetectorError {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return createDetectorError(
        detector,
        "PERMISSION_DENIED",
        `${detector} permission was denied.`,
        error,
      );
    }
    if (error.name === "AbortError") {
      return createDetectorError(detector, "ABORTED", `${detector} detection was aborted.`, error);
    }
    if (error.name === "NotSupportedError") {
      return createDetectorError(
        detector,
        "UNSUPPORTED",
        `${detector} is not supported in this environment.`,
        error,
      );
    }
    if (error.name === "TimeoutError") {
      return createDetectorError(detector, "TIMEOUT", `${detector} detection timed out.`, error);
    }
  }
  return createDetectorError(detector, "READ_FAILED", `${detector} detection failed.`, error);
}
