import type { RallyAuditLog, UserRallyState } from "./index.js";

/** Persistence contract for implementations backed by Redis, SQL, or another RDB. */
export interface ServerPersistenceAdapter {
  acquireLock(lockKey: string, ttlMs: number): Promise<boolean>;
  releaseLock(lockKey: string): Promise<void>;
  decrementRewardStock(rewardId: string): Promise<{ success: boolean; remainingStock: number }>;
  getIdempotentResult<T>(idempotencyKey: string): Promise<T | null>;
  saveIdempotentResult<T>(idempotencyKey: string, result: T, ttlMs: number): Promise<void>;
  getUserState(rallyId: string, userId: string): Promise<UserRallyState | null>;
  saveUserState(rallyId: string, userId: string, state: UserRallyState): Promise<void>;
  recordAuditLog(log: RallyAuditLog): Promise<void>;
}

interface TimedValue<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface InMemoryServerPersistenceOptions {
  readonly stocks?: Readonly<Record<string, number>>;
}

/** Deterministic adapter for tests and small single-process deployments. */
export class InMemoryServerPersistenceAdapter implements ServerPersistenceAdapter {
  readonly #locks = new Map<string, number>();
  readonly #idempotent = new Map<string, TimedValue<unknown>>();
  readonly #states = new Map<string, UserRallyState>();
  readonly #stocks: Map<string, number>;
  readonly #auditLogs: RallyAuditLog[] = [];

  constructor(options: InMemoryServerPersistenceOptions = {}) {
    this.#stocks = new Map(Object.entries(options.stocks ?? {}));
  }

  async acquireLock(lockKey: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const expiresAt = this.#locks.get(lockKey);
    if (expiresAt !== undefined && expiresAt > now) return false;
    this.#locks.set(lockKey, now + Math.max(1, ttlMs));
    return true;
  }

  async releaseLock(lockKey: string): Promise<void> {
    this.#locks.delete(lockKey);
  }

  async decrementRewardStock(
    rewardId: string,
  ): Promise<{ success: boolean; remainingStock: number }> {
    const stock = this.#stocks.get(rewardId);
    if (stock === undefined) return { success: true, remainingStock: Number.POSITIVE_INFINITY };
    if (stock <= 0) return { success: false, remainingStock: 0 };
    const remainingStock = stock - 1;
    this.#stocks.set(rewardId, remainingStock);
    return { success: true, remainingStock };
  }

  async getIdempotentResult<T>(idempotencyKey: string): Promise<T | null> {
    const entry = this.#idempotent.get(idempotencyKey);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.#idempotent.delete(idempotencyKey);
      return null;
    }
    return structuredClone(entry.value) as T;
  }

  async saveIdempotentResult<T>(idempotencyKey: string, result: T, ttlMs: number): Promise<void> {
    this.#idempotent.set(idempotencyKey, {
      value: structuredClone(result),
      expiresAt: Date.now() + Math.max(1, ttlMs),
    });
  }

  async getUserState(rallyId: string, userId: string): Promise<UserRallyState | null> {
    const state = this.#states.get(`${rallyId}:${userId}`);
    return state === undefined ? null : structuredClone(state);
  }

  async saveUserState(rallyId: string, userId: string, state: UserRallyState): Promise<void> {
    this.#states.set(`${rallyId}:${userId}`, structuredClone(state));
  }

  async recordAuditLog(log: RallyAuditLog): Promise<void> {
    this.#auditLogs.push(structuredClone(log));
  }

  getAuditLogs(): ReadonlyArray<RallyAuditLog> {
    return structuredClone(this.#auditLogs);
  }
}
