import type { UserRallyState } from "@stamprally/core";
import type { AuditLog } from "./index.js";

export interface ServerPersistenceAdapter {
  acquireLock(lockKey: string, ttlMs: number): Promise<boolean>;
  releaseLock(lockKey: string): Promise<void>;
  decrementRewardStock(
    rewardId: string,
  ): Promise<{ readonly success: boolean; readonly remainingStock: number }>;
  incrementRewardStock(rewardId: string): Promise<void>;
  getIdempotentResult<T>(key: string): Promise<T | null>;
  saveIdempotentResult<T>(key: string, result: T, ttlMs: number): Promise<void>;
  getUserClaimCount(rallyId: string, userId: string, rewardId: string): Promise<number>;
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
  readonly #claims = new Map<string, number>();
  readonly #auditLogs: AuditLog[] = [];
  constructor(options: InMemoryServerPersistenceOptions = {}) {
    this.#stocks = new Map(Object.entries(options.stocks ?? {}));
  }
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const until = this.#locks.get(key);
    if (until !== undefined && until > now) return false;
    this.#locks.set(key, now + Math.max(1, ttlMs));
    return true;
  }
  async releaseLock(key: string): Promise<void> {
    this.#locks.delete(key);
  }
  async decrementRewardStock(
    rewardId: string,
  ): Promise<{ success: boolean; remainingStock: number }> {
    const current = this.#stocks.get(rewardId);
    if (current === undefined) return { success: true, remainingStock: Number.POSITIVE_INFINITY };
    if (current <= 0) return { success: false, remainingStock: 0 };
    this.#stocks.set(rewardId, current - 1);
    return { success: true, remainingStock: current - 1 };
  }
  async incrementRewardStock(rewardId: string): Promise<void> {
    const current = this.#stocks.get(rewardId);
    if (current !== undefined) this.#stocks.set(rewardId, current + 1);
  }
  async getIdempotentResult<T>(key: string): Promise<T | null> {
    const value = this.#idempotent.get(key);
    if (value === undefined || value.expiresAt <= Date.now()) {
      this.#idempotent.delete(key);
      return null;
    }
    return structuredClone(value.value) as T;
  }
  async saveIdempotentResult<T>(key: string, result: T, ttlMs: number): Promise<void> {
    this.#idempotent.set(key, {
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
  recordClaim(rallyId: string, userId: string, rewardId: string): void {
    const key = `${rallyId}:${userId}:${rewardId}`;
    this.#claims.set(key, (this.#claims.get(key) ?? 0) + 1);
  }
}
