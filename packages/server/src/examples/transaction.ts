import type { UserRallyState } from "@stamprally/core";
import type { AuditLog } from "../index.js";
import type {
  CheckInTransactionMutation,
  CheckInTransactionParams,
  ClaimRewardMutationContext,
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
    readonly secondaryStock?: number | null;
    readonly claimCount: number;
    readonly userState: UserRallyState;
  }>;
  writeStock(
    transaction: Tx,
    params: ClaimRewardTransactionParams,
    nextStock: number,
  ): Promise<void>;
  writeSecondaryStock?(
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
  mutation: (current: ClaimRewardMutationContext) => ClaimRewardTransactionMutation,
): Promise<{ readonly success: boolean; readonly error?: string }> {
  try {
    return await database.transaction(async (transaction) => {
      const current = await store.readContext(transaction, params);
      const secondaryStock = current.secondaryStock ?? null;
      const rewardStock = params.stockKey === "__shared__" ? secondaryStock : current.stock;
      const next = mutation({
        ...current,
        rewardStock,
        sharedStock: params.stockKey === "__shared__" ? current.stock : null,
        primaryStock: rewardStock,
        secondaryStock,
        stock: current.stock,
      });
      if (next.error !== undefined) {
        await store.writeAudit(transaction, next.auditLog);
        if (params.idempotencyKey !== undefined && next.result !== undefined)
          await store.writeIdempotency(transaction, params, next.result);
        return { success: false, error: next.error };
      }
      if (next.nextSecondaryStock !== undefined && store.writeSecondaryStock === undefined)
        return { success: false, error: "INVENTORY_STORAGE_NOT_IMPLEMENTED" };
      if (next.nextStock !== null) await store.writeStock(transaction, params, next.nextStock);
      if (next.nextSecondaryStock !== undefined && store.writeSecondaryStock !== undefined) {
        if (next.nextSecondaryStock !== null)
          await store.writeSecondaryStock(transaction, params, next.nextSecondaryStock);
      }
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

export interface SqlCheckInStore<Tx> {
  readUserState?(transaction: Tx, params: CheckInTransactionParams): Promise<UserRallyState>;
  writeUserState(
    transaction: Tx,
    params: CheckInTransactionParams,
    state: UserRallyState,
  ): Promise<void>;
  writeAudit(transaction: Tx, log: AuditLog): Promise<void>;
  writeIdempotency(
    transaction: Tx,
    params: CheckInTransactionParams,
    result: unknown,
  ): Promise<void>;
}

/** Reference transaction block for a check-in state, audit, and idempotency write. */
export async function executeCheckInTransaction<Tx>(
  database: SqlTransactionDatabase<Tx>,
  store: SqlCheckInStore<Tx>,
  params: CheckInTransactionParams,
  mutation: (current: { readonly userState: UserRallyState }) => CheckInTransactionMutation,
  current?: UserRallyState,
): Promise<{ readonly success: boolean; readonly error?: string }> {
  try {
    return await database.transaction(async (transaction) => {
      const userState =
        current ??
        (store.readUserState === undefined
          ? (() => {
              throw new Error("A current user state or readUserState implementation is required.");
            })()
          : await store.readUserState(transaction, params));
      const next = mutation({ userState });
      if (next.error !== undefined) {
        await store.writeAudit(transaction, next.auditLog);
        if (params.idempotencyKey !== undefined && next.result !== undefined)
          await store.writeIdempotency(transaction, params, next.result);
        return { success: false, error: next.error };
      }
      await store.writeUserState(transaction, params, next.nextUserState);
      await store.writeAudit(transaction, next.auditLog);
      if (params.idempotencyKey !== undefined && next.result !== undefined)
        await store.writeIdempotency(transaction, params, next.result);
      return { success: true };
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface RedisMultiExecutor<TMulti> {
  multi(): TMulti;
  exec(multi: TMulti): Promise<ReadonlyArray<unknown> | null>;
}

/** Reference for Redis MULTI/EXEC adapters: all queued commands commit together. */
export async function executeRedisTransaction<TMulti>(
  redis: RedisMultiExecutor<TMulti>,
  queue: (multi: TMulti) => void,
): Promise<{ readonly success: boolean; readonly error?: string }> {
  try {
    const multi = redis.multi();
    queue(multi);
    const result = await redis.exec(multi);
    return result === null
      ? { success: false, error: "Redis transaction was aborted." }
      : { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
