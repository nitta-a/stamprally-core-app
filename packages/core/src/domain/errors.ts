import type { CheckInCondition } from "./models.js";

export interface ConditionMatch {
  readonly conditionType: CheckInCondition["type"];
  readonly distanceMeters?: number;
}
export type ConditionMismatch = {
  readonly code: "CONDITION_MISMATCH";
  readonly conditionType: CheckInCondition["type"];
  readonly reason: "INVALID_PROOF" | "INVALID_GEO_INPUT" | "OUTSIDE_RADIUS" | "VALIDATOR_FAILED";
  readonly distanceMeters?: number;
  readonly radiusMeters?: number;
};
export interface CompositeConditionFailure {
  readonly index: number;
  readonly error: ConditionMismatch;
}
export type StampError =
  | { readonly code: "SPOT_NOT_FOUND"; readonly spotId: string }
  | { readonly code: "STAMP_ALREADY_ACQUIRED"; readonly spotId: string }
  | { readonly code: "PREREQUISITES_NOT_MET"; readonly spotId: string }
  | { readonly code: "INVALID_PROOF"; readonly spotId: string }
  | {
      readonly code: "CUSTOM_VALIDATION_FAILED";
      readonly spotId: string;
      readonly message: string;
    };
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface CustomValidationContext {
  readonly rallyId: string;
  readonly spotId: string;
  readonly proofData: unknown;
  readonly condition: Extract<CheckInCondition, { readonly type: "custom" }>;
  readonly userState: import("./models.js").UserRallyState;
}
export interface CustomValidator {
  validate(
    context: CustomValidationContext,
  ): Promise<boolean | { readonly valid: boolean; readonly message?: string }>;
}
export type Validator =
  | CustomValidator
  | ((
      context: CustomValidationContext,
    ) =>
      | Promise<boolean | { readonly valid: boolean; readonly message?: string }>
      | boolean
      | { readonly valid: boolean; readonly message?: string });

export type { VerificationContext } from "./conditions.js";
