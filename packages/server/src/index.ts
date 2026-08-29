import type { UserRallyState } from "@stamprally/core";
export interface AuditLog {
  readonly id: string;
  readonly timestamp: string;
  readonly rallyId: string;
  readonly userId: string;
  readonly action: "CHECK_IN" | "CLAIM_REWARD";
  readonly resourceId: string;
  readonly status: "SUCCESS" | "REJECTED";
  readonly idempotencyKey: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export type SyncOperationStatus = "ACCEPTED" | "REJECTED_PERMANENT" | "RETRYABLE_ERROR";
export interface CheckInRequest {
  readonly rallyId: string;
  readonly userId?: string;
  readonly anonymousSessionId?: string;
  readonly spotId: string;
  readonly context: import("@stamprally/core").VerificationContext;
  readonly idempotencyKey: string;
  readonly now?: string | number;
}
export interface ClaimRewardRequest {
  readonly rallyId: string;
  readonly userId?: string;
  readonly anonymousSessionId?: string;
  readonly rewardId: string;
  readonly idempotencyKey: string;
  readonly staffPasscode?: string;
  readonly staffId?: string;
  readonly now?: string | number;
}
export type CheckInResponse =
  | { readonly ok: true; readonly state: UserRallyState; readonly status?: "ACCEPTED" }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly status?: "REJECTED_PERMANENT" | "RETRYABLE_ERROR";
    };
export interface ServerOptions {
  readonly lockTtlMs?: number;
  readonly idempotencyTtlMs?: number;
  readonly authenticate?: (
    request: Request,
  ) => Promise<string | AuthenticationContext | null> | string | AuthenticationContext | null;
  readonly customValidators?: Readonly<Record<string, import("@stamprally/core").Validator>>;
  readonly now?: () => string;
  readonly anonymousPolicy?: "session_scoped" | "reject" | "shared_global_opt_in_insecure";
}
export interface AuthenticationContext {
  readonly authenticatedUserId: string;
}
export type { UserRallyState } from "@stamprally/core";
export {
  executeCheckInTransaction,
  executeClaimRewardTransaction,
  executeRedisTransaction,
  type RedisMultiExecutor,
  type SqlCheckInStore,
  type SqlClaimRewardStore,
  type SqlTransactionDatabase,
} from "./examples/transaction.js";
export type {
  CheckInTransactionMutation,
  CheckInTransactionParams,
  ClaimRewardTransactionMutation,
  ClaimRewardTransactionParams,
  InMemoryServerPersistenceOptions,
  ServerPersistenceAdapter,
  UserClaimRecord,
} from "./persistence.js";
export { InMemoryServerPersistenceAdapter } from "./persistence.js";
export {
  assertValidCheckInParams,
  assertValidClaimParams,
  assertValidSyncParams,
  type RequestValidationError,
  RequestValidationException,
  type RequestValidationResult,
  validateCheckInRequest,
  validateClaimRewardRequest,
  validateSyncRequest,
} from "./security.js";
export { StampRallyServer } from "./server.js";
export { runPersistenceAdapterComplianceTests } from "./testing/index.js";
