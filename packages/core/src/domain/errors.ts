import type { StampCondition, VerificationContext } from "./conditions.js";

export interface ConditionMatch {
  readonly conditionType: StampCondition["type"];
  readonly distanceMeters?: number;
}

export interface CompositeConditionFailure {
  readonly index: number;
  readonly error: ConditionMismatch;
}

export type ConditionMismatch =
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly conditionType: Exclude<StampCondition["type"], "time_window">;
      readonly reason: "CONTEXT_TYPE_MISMATCH";
      readonly expectedContextType: VerificationContext["type"];
      readonly actualContextType: VerificationContext["type"];
    }
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly conditionType: "token";
      readonly reason: "TOKEN_MISMATCH";
    }
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly conditionType: "geo";
      readonly reason: "INVALID_GEO_INPUT";
    }
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly conditionType: "geo";
      readonly reason: "OUTSIDE_RADIUS";
      readonly distanceMeters: number;
      readonly radiusMeters: number;
      readonly differenceMeters: number;
    }
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly conditionType: "composite";
      readonly reason: "CONTEXT_LENGTH_MISMATCH";
      readonly expectedCount: number;
      readonly actualCount: number;
    }
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly conditionType: "composite";
      readonly reason: "AND_CHILD_FAILED" | "OR_ALL_FAILED";
      readonly failures: ReadonlyArray<CompositeConditionFailure>;
    }
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly conditionType: "time_window";
      readonly reason: "INVALID_NOW" | "INVALID_TIME_WINDOW" | "BEFORE_START" | "AFTER_END";
      readonly now: string;
      readonly startsAt: string;
      readonly endsAt: string;
    };

export type StampError =
  | {
      readonly code: "STAMP_NOT_FOUND";
      readonly stampId: string;
    }
  | {
      readonly code: "STAMP_ALREADY_ACQUIRED";
      readonly stampId: string;
    }
  | {
      readonly code: "INVALID_ORDER";
      readonly stampId: string;
      readonly expectedStampId: string;
    }
  | {
      readonly code: "CONDITION_MISMATCH";
      readonly stampId: string;
      readonly mismatch: ConditionMismatch;
    }
  | {
      readonly code: "OFFLINE_QUEUED";
      readonly stampId: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly code: "INVALID_PROOF";
      readonly stampId: string;
    };

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
