import type { UserRallyState } from "@stamprally/core";
import type { AuditLog } from "./index.js";

export interface UserClaimRecord {
  readonly rallyId: string;
  readonly userId: string;
  readonly rewardId: string;
  readonly ticketNumber: string;
  readonly timestamp: number;
}

export interface ClaimRewardTransactionParams {
  readonly rallyId: string;
  readonly userId: string;
  readonly rewardId: string;
  readonly ticketNumber: string;
  readonly timestamp: number;
  readonly idempotencyKey?: string;
  readonly proofData?: unknown;
  readonly idempotencyTtlMs?: number;
  /** Used when the first claim is made before a user state has been stored. */
  readonly initialUserState?: UserRallyState;
  readonly stockKey?: string;
  readonly secondaryStockKey?: string;
  readonly initialStock?: number | null;
  readonly initialSecondaryStock?: number | null;
}

export interface ClaimRewardTransactionMutation {
  readonly nextStock: number | null;
  readonly nextSecondaryStock?: number | null;
  readonly nextUserState: UserRallyState;
  readonly auditLog: AuditLog;
  /** The server response is persisted by the adapter with the idempotency key. */
  readonly result?: unknown;
  /** A domain rejection is committed as an audit/idempotency record without mutations. */
  readonly error?: string;
}

export interface CheckInTransactionParams {
  readonly rallyId: string;
  readonly userId: string;
  readonly spotId: string;
  readonly timestamp: number;
  readonly idempotencyKey?: string;
  readonly proofData?: unknown;
  readonly idempotencyTtlMs?: number;
  readonly initialUserState?: UserRallyState;
}

export interface CheckInTransactionMutation {
  readonly nextUserState: UserRallyState;
  readonly auditLog: AuditLog;
  readonly result?: unknown;
  readonly error?: string;
}

export interface ServerPersistenceAdapter {
  /** Atomically commits user state, audit log, and idempotency data. */
  executeCheckInTransaction(
    params: CheckInTransactionParams,
    mutation: (current: { readonly userState: UserRallyState }) => CheckInTransactionMutation,
  ): Promise<{ readonly success: boolean; readonly error?: string }>;
  /**
   * Atomically commits stock, user state, claim count, audit log, and idempotency data.
   * Adapters must roll back every write when the callback or any commit operation fails.
   */
  executeClaimRewardTransaction(
    params: ClaimRewardTransactionParams,
    mutation: (current: {
      readonly stock: number | null;
      readonly secondaryStock: number | null;
      readonly claimCount: number;
      readonly userState: UserRallyState;
    }) => ClaimRewardTransactionMutation,
  ): Promise<{ readonly success: boolean; readonly error?: string }>;
  acquireLock(rallyId: string, lockKey: string, ttlMs: number): Promise<boolean>;
  releaseLock(rallyId: string, lockKey: string): Promise<void>;
  getRewardStock(rallyId: string, rewardId: string): Promise<number | null>;
  decrementRewardStock(
    rallyId: string,
    rewardId: string,
  ): Promise<{ readonly success: boolean; readonly remainingStock: number }>;
  getIdempotentResult<T>(rallyId: string, key: string): Promise<T | null>;
  saveIdempotentResult<T>(rallyId: string, key: string, result: T, ttlMs: number): Promise<void>;
  getUserClaimCount(rallyId: string, userId: string, rewardId: string): Promise<number>;
  recordUserClaim(params: UserClaimRecord): Promise<void>;
  recordClaim?(params: UserClaimRecord): Promise<void>;
  incrementUserClaimCount?(rallyId: string, userId: string, rewardId: string): Promise<void>;
  getUserState(rallyId: string, userId: string): Promise<UserRallyState | null>;
  saveUserState(rallyId: string, userId: string, state: UserRallyState): Promise<void>;
  recordAuditLog(log: AuditLog): Promise<void>;
  removeAuditLog?(auditId: string): Promise<void>;
}
interface TimedValue<T> {
  readonly value: T;
  readonly expiresAt: number;
}
export interface InMemoryServerPersistenceOptions {
  readonly stocks?: Readonly<Record<string, number>>;
}
export class InMemoryServerPersistenceAdapter implements ServerPersistenceAdapter {
  readonly #locks = new Map<string, number>();
  readonly #idempotent = new Map<string, TimedValue<unknown>>();
  readonly #states = new Map<string, UserRallyState>();
  readonly #stocks: Map<string, number>;
  readonly #stockDefaults: Map<string, number>;
  readonly #claims = new Map<string, number>();
  readonly #claimRecords: UserClaimRecord[] = [];
  readonly #auditLogs: AuditLog[] = [];
  constructor(options: InMemoryServerPersistenceOptions = {}) {
    this.#stocks = new Map();
    this.#stockDefaults = new Map();
    for (const [key, stock] of Object.entries(options.stocks ?? {})) {
      if (key.includes(":")) this.#stocks.set(key, stock);
      else this.#stockDefaults.set(key, stock);
    }
  }
  #key(rallyId: string, key: string): string {
    return `${rallyId}:${key}`;
  }
  #stockKey(rallyId: string, rewardId: string): string {
    const scopedKey = `${rallyId}:${rewardId}`;
    if (this.#stocks.has(scopedKey)) return scopedKey;
    const defaultStock = this.#stockDefaults.get(rewardId);
    if (defaultStock !== undefined) {
      this.#stocks.set(scopedKey, defaultStock);
      return scopedKey;
    }
    return scopedKey;
  }
  async acquireLock(rallyId: string, key: string, ttlMs: number): Promise<boolean> {
    const scopedKey = this.#key(rallyId, key);
    const now = Date.now();
    const until = this.#locks.get(scopedKey);
    if (until !== undefined && until > now) return false;
    this.#locks.set(scopedKey, now + Math.max(1, ttlMs));
    return true;
  }
  async releaseLock(rallyId: string, key: string): Promise<void> {
    this.#locks.delete(this.#key(rallyId, key));
  }
  async getRewardStock(rallyId: string, rewardId: string): Promise<number | null> {
    return this.#stocks.get(this.#stockKey(rallyId, rewardId)) ?? null;
  }
  async decrementRewardStock(
    rallyId: string,
    rewardId: string,
  ): Promise<{ success: boolean; remainingStock: number }> {
    const key = this.#stockKey(rallyId, rewardId);
    const current = this.#stocks.get(key);
    if (current === undefined) return { success: true, remainingStock: Number.POSITIVE_INFINITY };
    if (current <= 0) return { success: false, remainingStock: 0 };
    this.#stocks.set(key, current - 1);
    return { success: true, remainingStock: current - 1 };
  }
  async restoreRewardStock(rallyId: string, rewardId: string, count = 1): Promise<void> {
    const key = this.#stockKey(rallyId, rewardId);
    const current = this.#stocks.get(key);
    if (current !== undefined) this.#stocks.set(key, current + Math.max(0, count));
  }

  async executeClaimRewardTransaction(
    params: ClaimRewardTransactionParams,
    mutation: (current: {
      readonly stock: number | null;
      readonly secondaryStock: number | null;
      readonly claimCount: number;
      readonly userState: UserRallyState;
    }) => ClaimRewardTransactionMutation,
  ): Promise<{ readonly success: boolean; readonly error?: string }> {
    try {
      return await this.runTransaction(params.rallyId, async () => {
        const userState =
          (await this.getUserState(params.rallyId, params.userId)) ?? params.initialUserState;
        if (userState === undefined)
          return { success: false, error: "A user state is required for this transaction." };
        const storedStock = await this.getRewardStock(
          params.rallyId,
          params.stockKey ?? params.rewardId,
        );
        const storedSecondaryStock =
          params.secondaryStockKey === undefined
            ? null
            : await this.getRewardStock(params.rallyId, params.secondaryStockKey);
        const mutationResult = mutation({
          stock: storedStock ?? params.initialStock ?? null,
          secondaryStock: storedSecondaryStock ?? params.initialSecondaryStock ?? null,
          claimCount: await this.getUserClaimCount(params.rallyId, params.userId, params.rewardId),
          userState,
        });
        const idempotencyKey = params.idempotencyKey;
        if (mutationResult.error !== undefined) {
          await this.recordAuditLog(mutationResult.auditLog);
          if (idempotencyKey !== undefined && mutationResult.result !== undefined)
            await this.saveIdempotentResult(
              params.rallyId,
              idempotencyKey,
              mutationResult.result,
              params.idempotencyTtlMs ?? 86_400_000,
            );
          return { success: false, error: mutationResult.error };
        }
        const currentStock = await this.getRewardStock(
          params.rallyId,
          params.stockKey ?? params.rewardId,
        );
        const effectiveStock = currentStock ?? params.initialStock ?? null;
        if (
          currentStock === null &&
          params.initialStock !== undefined &&
          params.initialStock !== null
        )
          this.#stocks.set(
            this.#stockKey(params.rallyId, params.stockKey ?? params.rewardId),
            params.initialStock,
          );
        const currentSecondaryStock =
          params.secondaryStockKey === undefined
            ? null
            : await this.getRewardStock(params.rallyId, params.secondaryStockKey);
        const effectiveSecondaryStock =
          currentSecondaryStock ?? params.initialSecondaryStock ?? null;
        if (
          currentSecondaryStock === null &&
          params.secondaryStockKey !== undefined &&
          params.initialSecondaryStock !== undefined &&
          params.initialSecondaryStock !== null
        )
          this.#stocks.set(
            this.#stockKey(params.rallyId, params.secondaryStockKey),
            params.initialSecondaryStock,
          );
        if (
          effectiveStock !== null &&
          (mutationResult.nextStock === null || mutationResult.nextStock < 0)
        )
          throw new Error("The transaction produced an invalid stock value.");
        if (effectiveStock === null && mutationResult.nextStock !== null)
          throw new Error("The transaction changed an unlimited stock to a limited stock.");
        if (mutationResult.nextStock !== null)
          this.#stocks.set(
            this.#stockKey(params.rallyId, params.stockKey ?? params.rewardId),
            mutationResult.nextStock,
          );
        if (
          params.secondaryStockKey !== undefined &&
          mutationResult.nextSecondaryStock !== undefined
        ) {
          if (
            effectiveSecondaryStock !== null &&
            (mutationResult.nextSecondaryStock === null || mutationResult.nextSecondaryStock < 0)
          )
            throw new Error("The transaction produced an invalid secondary stock value.");
          if (effectiveSecondaryStock === null && mutationResult.nextSecondaryStock !== null)
            throw new Error(
              "The transaction changed an unlimited secondary stock to a limited stock.",
            );
          if (mutationResult.nextSecondaryStock !== null)
            this.#stocks.set(
              this.#stockKey(params.rallyId, params.secondaryStockKey),
              mutationResult.nextSecondaryStock,
            );
        }
        await this.saveUserState(params.rallyId, params.userId, mutationResult.nextUserState);
        const reward = mutationResult.nextUserState.rewards.find(
          (item) => item.rewardId === params.rewardId,
        );
        if (reward?.claimTicketNumber !== undefined)
          await this.recordUserClaim({
            rallyId: params.rallyId,
            userId: params.userId,
            rewardId: params.rewardId,
            ticketNumber: reward.claimTicketNumber,
            timestamp: params.timestamp,
          });
        await this.recordAuditLog(mutationResult.auditLog);
        if (idempotencyKey !== undefined && mutationResult.result !== undefined)
          await this.saveIdempotentResult(
            params.rallyId,
            idempotencyKey,
            mutationResult.result,
            params.idempotencyTtlMs ?? 86_400_000,
          );
        return { success: true };
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async executeCheckInTransaction(
    params: CheckInTransactionParams,
    mutation: (current: { readonly userState: UserRallyState }) => CheckInTransactionMutation,
  ): Promise<{ readonly success: boolean; readonly error?: string }> {
    try {
      return await this.runTransaction(params.rallyId, async () => {
        const userState =
          (await this.getUserState(params.rallyId, params.userId)) ?? params.initialUserState;
        if (userState === undefined)
          return { success: false, error: "A user state is required for this transaction." };
        const mutationResult = mutation({ userState });
        if (mutationResult.error !== undefined) {
          await this.recordAuditLog(mutationResult.auditLog);
          if (params.idempotencyKey !== undefined && mutationResult.result !== undefined)
            await this.saveIdempotentResult(
              params.rallyId,
              params.idempotencyKey,
              mutationResult.result,
              params.idempotencyTtlMs ?? 86_400_000,
            );
          return { success: false, error: mutationResult.error };
        }
        await this.saveUserState(params.rallyId, params.userId, mutationResult.nextUserState);
        await this.recordAuditLog(mutationResult.auditLog);
        if (params.idempotencyKey !== undefined && mutationResult.result !== undefined)
          await this.saveIdempotentResult(
            params.rallyId,
            params.idempotencyKey,
            mutationResult.result,
            params.idempotencyTtlMs ?? 86_400_000,
          );
        return { success: true };
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async rollbackUserState(
    rallyId: string,
    userId: string,
    previousState: UserRallyState | null,
  ): Promise<void> {
    const key = `${rallyId}:${userId}`;
    if (previousState === null) this.#states.delete(key);
    else this.#states.set(key, structuredClone(previousState));
  }
  async getIdempotentResult<T>(rallyId: string, key: string): Promise<T | null> {
    const value = this.#idempotent.get(this.#key(rallyId, key));
    if (value === undefined || value.expiresAt <= Date.now()) {
      this.#idempotent.delete(this.#key(rallyId, key));
      return null;
    }
    return structuredClone(value.value) as T;
  }
  async saveIdempotentResult<T>(
    rallyId: string,
    key: string,
    result: T,
    ttlMs: number,
  ): Promise<void> {
    this.#idempotent.set(this.#key(rallyId, key), {
      value: structuredClone(result),
      expiresAt: Date.now() + Math.max(1, ttlMs),
    });
  }
  async getUserClaimCount(rallyId: string, userId: string, rewardId: string): Promise<number> {
    return this.#claims.get(`${rallyId}:${userId}:${rewardId}`) ?? 0;
  }
  async getUserState(rallyId: string, userId: string): Promise<UserRallyState | null> {
    const value = this.#states.get(`${rallyId}:${userId}`);
    return value === undefined ? null : structuredClone(value);
  }
  async saveUserState(rallyId: string, userId: string, state: UserRallyState): Promise<void> {
    this.#states.set(`${rallyId}:${userId}`, structuredClone(state));
  }
  async recordAuditLog(log: AuditLog): Promise<void> {
    this.#auditLogs.push(structuredClone(log));
  }
  async removeAuditLog(auditId: string): Promise<void> {
    const index = this.#auditLogs.findIndex((log) => log.id === auditId);
    if (index >= 0) this.#auditLogs.splice(index, 1);
  }
  getAuditLogs(): ReadonlyArray<AuditLog> {
    return structuredClone(this.#auditLogs);
  }
  async recordUserClaim(params: UserClaimRecord): Promise<void> {
    const { rallyId, userId, rewardId } = params;
    const key = `${rallyId}:${userId}:${rewardId}`;
    this.#claims.set(key, (this.#claims.get(key) ?? 0) + 1);
    this.#claimRecords.push(structuredClone(params));
  }
  async rollbackUserClaim(
    rallyId: string,
    userId: string,
    rewardId: string,
    ticketNumber: string,
  ): Promise<void> {
    const key = `${rallyId}:${userId}:${rewardId}`;
    const count = this.#claims.get(key) ?? 0;
    if (count <= 1) this.#claims.delete(key);
    else this.#claims.set(key, count - 1);
    const index = this.#claimRecords.findIndex(
      (record) =>
        record.rallyId === rallyId &&
        record.userId === userId &&
        record.rewardId === rewardId &&
        record.ticketNumber === ticketNumber,
    );
    if (index >= 0) this.#claimRecords.splice(index, 1);
  }
  async incrementUserClaimCount(rallyId: string, userId: string, rewardId: string): Promise<void> {
    const key = `${rallyId}:${userId}:${rewardId}`;
    this.#claims.set(key, (this.#claims.get(key) ?? 0) + 1);
  }
  getClaimRecords(): ReadonlyArray<UserClaimRecord> {
    return structuredClone(this.#claimRecords);
  }
  /** @deprecated Use recordUserClaim with a ticket number and timestamp. */
  recordClaim(params: UserClaimRecord): Promise<void>;
  recordClaim(rallyId: string, userId: string, rewardId: string): Promise<void>;
  recordClaim(
    paramsOrRallyId: UserClaimRecord | string,
    userId?: string,
    rewardId?: string,
  ): Promise<void> {
    const params: UserClaimRecord =
      typeof paramsOrRallyId === "string"
        ? {
            rallyId: paramsOrRallyId,
            userId: userId ?? "",
            rewardId: rewardId ?? "",
            ticketNumber: "",
            timestamp: Date.now(),
          }
        : paramsOrRallyId;
    return this.recordUserClaim(params);
  }

  async runTransaction<T>(
    _rallyId: string,
    operation: (transaction: ServerPersistenceAdapter) => Promise<T>,
  ): Promise<T> {
    const snapshot = {
      stocks: new Map(this.#stocks),
      idempotent: new Map(this.#idempotent),
      states: new Map(this.#states),
      claims: new Map(this.#claims),
      claimRecords: structuredClone(this.#claimRecords),
      auditLogs: structuredClone(this.#auditLogs),
    };
    try {
      return await operation(this);
    } catch (error) {
      this.#stocks.clear();
      for (const [key, value] of snapshot.stocks) this.#stocks.set(key, value);
      this.#idempotent.clear();
      for (const [key, value] of snapshot.idempotent)
        this.#idempotent.set(key, structuredClone(value));
      this.#states.clear();
      for (const [key, value] of snapshot.states) this.#states.set(key, structuredClone(value));
      this.#claims.clear();
      for (const [key, value] of snapshot.claims) this.#claims.set(key, value);
      this.#claimRecords.splice(0, this.#claimRecords.length, ...snapshot.claimRecords);
      this.#auditLogs.splice(0, this.#auditLogs.length, ...snapshot.auditLogs);
      throw error;
    }
  }
}
