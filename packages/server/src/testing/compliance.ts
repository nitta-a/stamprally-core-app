import type { UserRallyState } from "@stamprally/core";
import type {
  AuditLog,
  ClaimRewardTransactionMutation,
  ClaimRewardTransactionParams,
} from "../index.js";
import type { ServerPersistenceAdapter } from "../persistence.js";

const state = (userId: string): UserRallyState => ({
  rallyId: "compliance-rally",
  userId,
  records: [],
  rewards: [{ rewardId: "reward", status: "AVAILABLE" }],
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function audit(idempotencyKey: string, userId: string): AuditLog {
  return {
    id: `audit-${idempotencyKey}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    rallyId: "compliance-rally",
    userId,
    action: "CLAIM_REWARD",
    resourceId: "reward",
    status: "SUCCESS",
    idempotencyKey,
  };
}

function params(userId: string, idempotencyKey: string): ClaimRewardTransactionParams {
  return {
    rallyId: "compliance-rally",
    userId,
    rewardId: "reward",
    ticketNumber: `ticket-${idempotencyKey}`,
    timestamp: Date.parse("2026-01-01T00:00:00.000Z"),
    idempotencyKey,
    rewardStockLimit: 1,
    sharedStockLimit: 1,
    stockKey: "__shared__",
    secondaryStockKey: "reward",
    initialStock: 1,
    initialSecondaryStock: 1,
    initialUserState: state(userId),
  };
}

function mutation(current: {
  readonly stock: number | null;
  readonly secondaryStock: number | null;
  readonly userState: UserRallyState;
}): ClaimRewardTransactionMutation {
  if (current.stock === 0 || current.secondaryStock === 0)
    return {
      nextStock: current.stock,
      nextSecondaryStock: current.secondaryStock,
      nextUserState: current.userState,
      auditLog: audit("rejected", current.userState.userId ?? "unknown"),
      error: "OUT_OF_STOCK",
    };
  return {
    nextStock: current.stock === null ? null : current.stock - 1,
    nextSecondaryStock: current.secondaryStock === null ? null : current.secondaryStock - 1,
    nextUserState: {
      ...current.userState,
      rewards: [{ rewardId: "reward", status: "CONSUMED" }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    auditLog: audit("success", current.userState.userId ?? "unknown"),
    result: { ok: true },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Persistence adapter compliance failed: ${message}`);
}

/**
 * Runs the minimum atomicity and idempotency contract against a persistence adapter.
 * The function throws a descriptive error when the adapter violates the contract.
 */
export async function runPersistenceAdapterComplianceTests(
  createAdapter: () => Promise<ServerPersistenceAdapter>,
): Promise<void> {
  const adapter = await createAdapter();
  assert(
    adapter.supportsRewardStock !== false,
    "the adapter must explicitly support reward stock for this suite",
  );

  const [first, second] = await Promise.all([
    adapter.executeClaimRewardTransaction(params("alice", "race-a"), mutation),
    adapter.executeClaimRewardTransaction(params("bob", "race-b"), mutation),
  ]);
  assert([first.success, second.success].filter(Boolean).length === 1, "race was not serialized");
  assert(
    (await adapter.getRewardStock("compliance-rally", "__shared__")) === 0,
    "shared stock was not decremented atomically",
  );
  assert(
    (await adapter.getRewardStock("compliance-rally", "reward")) === 0,
    "per-reward stock was not decremented atomically",
  );

  const exhausted = await adapter.executeClaimRewardTransaction(
    params("carol", "boundary"),
    mutation,
  );
  assert(!exhausted.success, "a zero-stock claim was accepted");
  assert(
    (await adapter.getRewardStock("compliance-rally", "__shared__")) === 0 &&
      (await adapter.getRewardStock("compliance-rally", "reward")) === 0,
    "zero-stock rejection did not preserve both stock boundaries",
  );

  const idempotentAdapter = await createAdapter();
  const idempotentParams = params("alice", "same-key");
  const firstClaim = await idempotentAdapter.executeClaimRewardTransaction(
    idempotentParams,
    mutation,
  );
  const secondClaim = await idempotentAdapter.executeClaimRewardTransaction(
    idempotentParams,
    mutation,
  );
  assert(firstClaim.success && secondClaim.success, "idempotent claim did not remain successful");
  assert(
    (await idempotentAdapter.getRewardStock("compliance-rally", "__shared__")) === 0,
    "idempotent retry decremented shared stock twice",
  );
  assert(
    (await idempotentAdapter.getRewardStock("compliance-rally", "reward")) === 0,
    "idempotent retry decremented per-reward stock twice",
  );

  const rollbackAdapter = await createAdapter();
  const rollbackParams = params("alice", "rollback");
  const rollback = await rollbackAdapter.executeClaimRewardTransaction(rollbackParams, () => {
    throw new Error("forced rollback");
  });
  assert(!rollback.success, "a failed mutation was committed");
  assert(
    (await rollbackAdapter.getRewardStock("compliance-rally", "__shared__")) === null,
    "rollback changed shared stock",
  );
  assert(
    (await rollbackAdapter.getRewardStock("compliance-rally", "reward")) === null,
    "rollback changed per-reward stock",
  );
}
