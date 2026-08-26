import type { SpotItem, VerificationContext } from "../domain/index.js";
import { evaluateConditionDetailed } from "./evaluate.js";

export type CheckInErrorCode =
  | "ORDER_VIOLATION"
  | "OUT_OF_RANGE"
  | "EXPIRED"
  | "INVALID_PROOF"
  | "INVALID_CONTEXT"
  | "ALREADY_CLAIMED";

export interface CheckInContext {
  readonly verificationContext: VerificationContext;
  readonly now?: string;
  readonly expectedStampId?: string;
  readonly proof?: string;
  readonly alreadyClaimed?: boolean;
}

export type CheckInInput =
  | VerificationContext
  | (VerificationContext & {
      readonly now?: string;
      readonly expectedStampId?: string;
      readonly alreadyClaimed?: boolean;
    })
  | CheckInContext;

export type CheckInResult =
  | {
      readonly ok: true;
      readonly success: true;
      readonly stampId: string;
      readonly checkedAt: string;
    }
  | {
      readonly ok: false;
      readonly success: false;
      readonly code: CheckInErrorCode;
      readonly stampId: string;
      readonly message: string;
    };

function unwrapContext(input: CheckInInput): {
  readonly context: VerificationContext;
  readonly now: string;
  readonly expectedStampId?: string;
  readonly alreadyClaimed: boolean;
} {
  if ("verificationContext" in input) {
    return {
      context: input.verificationContext,
      now: input.now ?? new Date().toISOString(),
      ...(input.expectedStampId === undefined ? {} : { expectedStampId: input.expectedStampId }),
      alreadyClaimed: input.alreadyClaimed ?? false,
    };
  }
  return {
    context: input,
    now: "now" in input && typeof input.now === "string" ? input.now : new Date().toISOString(),
    ...("expectedStampId" in input && typeof input.expectedStampId === "string"
      ? { expectedStampId: input.expectedStampId }
      : {}),
    alreadyClaimed: "alreadyClaimed" in input && input.alreadyClaimed === true,
  };
}

export function evaluateCheckIn(spot: SpotItem, input: CheckInInput): CheckInResult {
  const context = unwrapContext(input);
  if (context.alreadyClaimed) {
    return {
      ok: false,
      success: false,
      code: "ALREADY_CLAIMED",
      stampId: spot.id,
      message: "This spot has already been claimed.",
    };
  }
  if (context.expectedStampId !== undefined && context.expectedStampId !== spot.id) {
    return {
      ok: false,
      success: false,
      code: "ORDER_VIOLATION",
      stampId: spot.id,
      message: `The next required spot is '${context.expectedStampId}'.`,
    };
  }
  const evaluated = evaluateConditionDetailed(spot.condition, context.context, context.now);
  if (evaluated.ok) {
    return { ok: true, success: true, stampId: spot.id, checkedAt: context.now };
  }
  const code =
    evaluated.error.reason === "OUTSIDE_RADIUS"
      ? "OUT_OF_RANGE"
      : evaluated.error.reason === "BEFORE_START" || evaluated.error.reason === "AFTER_END"
        ? "EXPIRED"
        : evaluated.error.reason === "TOKEN_MISMATCH"
          ? "INVALID_PROOF"
          : "INVALID_CONTEXT";
  return { ok: false, success: false, code, stampId: spot.id, message: evaluated.error.reason };
}
