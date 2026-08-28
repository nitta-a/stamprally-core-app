import type { UserRallyState } from "@stamprally/core";
import type { AuditLog } from "../index.js";
import type {
  ClaimRewardTransactionMutation,
  ClaimRewardTransactionParams,
} from "../persistence.js";

/**
 * Minimal database contract for the SQL reference implementation.
 *
 * `readContext` should use SELECT ... FOR UPDATE for the stock, claim-count,
 * and user-state rows. The adapter's transaction implementation must commit
 * or roll back every operation performed through the transaction handle.
 */
export interface SqlTransactionDatabase<Tx> {
  transaction<T>(operation: (transaction: Tx) => Promise<T>): Promise<T>;
}

export interface SqlClaimRewardStore<Tx> {
  readContext(
    transaction: Tx,
    params: ClaimRewardTransactionParams,
  ): Promise<{
    readonly stock: number | null;
    readonly claimCount: number;
    readonly userState: UserRallyState;
  }>;
  writeStock(
    transaction: Tx,
    params: ClaimRewardTransactionParams,
    nextStock: number,
  ): Promise<void>;
  writeUserState(
    transaction: Tx,
    params: ClaimRewardTransactionParams,
    state: UserRallyState,
  ): Promise<void>;
  writeClaimRecord(
    transaction: Tx,
    params: ClaimRewardTransactionParams,
    state: UserRallyState,
  ): Promise<void>;
  writeAudit(transaction: Tx, log: AuditLog): Promise<void>;
  writeIdempotency(
    transaction: Tx,
    params: ClaimRewardTransactionParams,
    result: unknown,
  ): Promise<void>;
}

/**
 * Reference implementation for PostgreSQL, MySQL, or another transactional
 * SQL store. Domain rejections still write their audit/idempotency records,
 * while unexpected write failures reject the transaction and roll everything
 * back.
 */
export async function executeClaimRewardTransaction<Tx>(
  database: SqlTransactionDatabase<Tx>,
  store: SqlClaimRewardStore<Tx>,
  params: ClaimRewardTransactionParams,
  mutation: (current: {
    readonly stock: number | null;
    readonly claimCount: number;
    readonly userState: UserRallyState;
  }) => ClaimRewardTransactionMutation,
): Promise<{ readonly success: boolean; readonly error?: string }> {
  try {
    return await database.transaction(async (transaction) => {
      const current = await store.readContext(transaction, params);
      const next = mutation(current);
      if (next.error !== undefined) {
        await store.writeAudit(transaction, next.auditLog);
        if (params.idempotencyKey !== undefined && next.result !== undefined)
          await store.writeIdempotency(transaction, params, next.result);
        return { success: false, error: next.error };
      }
      if (next.nextStock !== null) await store.writeStock(transaction, params, next.nextStock);
      await store.writeUserState(transaction, params, next.nextUserState);
      await store.writeClaimRecord(transaction, params, next.nextUserState);
      await store.writeAudit(transaction, next.auditLog);
      if (params.idempotencyKey !== undefined && next.result !== undefined)
        await store.writeIdempotency(transaction, params, next.result);
      return { success: true };
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
