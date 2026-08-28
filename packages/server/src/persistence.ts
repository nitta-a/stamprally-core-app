import type { UserRallyState } from "@stamprally/core";
import type { AuditLog } from "./index.js";

export interface UserClaimRecord {
  readonly rallyId: string;
  readonly userId: string;
  readonly rewardId: string;
  readonly ticketNumber: string;
  readonly timestamp: number;
}

export interface ServerPersistenceAdapter {
  acquireLock(rallyId: string, lockKey: string, ttlMs: number): Promise<boolean>;
  releaseLock(rallyId: string, lockKey: string): Promise<void>;
  getRewardStock(rallyId: string, rewardId: string): Promise<number | null>;
  decrementRewardStock(
    rallyId: string,
    rewardId: string,
  ): Promise<{ readonly success: boolean; readonly remainingStock: number }>;
  restoreRewardStock?(rallyId: string, rewardId: string): Promise<void>;
  getIdempotentResult<T>(rallyId: string, key: string): Promise<T | null>;
  saveIdempotentResult<T>(rallyId: string, key: string, result: T, ttlMs: number): Promise<void>;
  getUserClaimCount(rallyId: string, userId: string, rewardId: string): Promise<number>;
  recordUserClaim(params: UserClaimRecord): Promise<void>;
  recordClaim?(params: UserClaimRecord): Promise<void>;
  incrementUserClaimCount?(rallyId: string, userId: string, rewardId: string): Promise<void>;
  getUserState(rallyId: string, userId: string): Promise<UserRallyState | null>;
  saveUserState(rallyId: string, userId: string, state: UserRallyState): Promise<void>;
  recordAuditLog(log: AuditLog): Promise<void>;
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
  async restoreRewardStock(rallyId: string, rewardId: string): Promise<void> {
    const key = this.#stockKey(rallyId, rewardId);
    const current = this.#stocks.get(key);
    if (current !== undefined) this.#stocks.set(key, current + 1);
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
  getAuditLogs(): ReadonlyArray<AuditLog> {
    return structuredClone(this.#auditLogs);
  }
  async recordUserClaim(params: UserClaimRecord): Promise<void> {
    const { rallyId, userId, rewardId } = params;
    const key = `${rallyId}:${userId}:${rewardId}`;
    this.#claims.set(key, (this.#claims.get(key) ?? 0) + 1);
    this.#claimRecords.push(structuredClone(params));
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
}
