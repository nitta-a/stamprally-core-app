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
export interface CheckInRequest {
  readonly rallyId: string;
  readonly userId?: string;
  readonly spotId: string;
  readonly context: import("@stamprally/core").VerificationContext;
  readonly idempotencyKey: string;
  readonly now?: string;
}
export interface ClaimRewardRequest {
  readonly rallyId: string;
  readonly userId?: string;
  readonly rewardId: string;
  readonly idempotencyKey: string;
  readonly staffPasscode?: string;
  readonly staffId?: string;
  readonly now?: string;
}
export type CheckInResponse =
  | { readonly ok: true; readonly state: UserRallyState }
  | { readonly ok: false; readonly code: string; readonly message: string };
export interface ServerOptions {
  readonly lockTtlMs?: number;
  readonly idempotencyTtlMs?: number;
  readonly authenticate?: (request: Request) => Promise<string | null> | string | null;
  readonly customValidators?: Readonly<Record<string, import("@stamprally/core").Validator>>;
  readonly now?: () => string;
}
export type { UserRallyState } from "@stamprally/core";
export type {
  ClaimRewardTransactionMutation,
  ClaimRewardTransactionParams,
  InMemoryServerPersistenceOptions,
  ServerPersistenceAdapter,
  UserClaimRecord,
} from "./persistence.js";
export { InMemoryServerPersistenceAdapter } from "./persistence.js";
export { StampRallyServer } from "./server.js";
