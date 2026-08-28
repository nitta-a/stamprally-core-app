import type {
  CustomValidationContext,
  PublicCheckInCondition,
  PublicRallyConfig,
  RallyConfig,
  Result,
  Reward,
  RewardState,
  StampRecord,
  UserRallyState,
  Validator,
} from "../domain/index.js";
import { consumeReward, type RewardConsumeError, reconcileRewardStates } from "../engine/index.js";
import { resolveRallyStateConflict } from "../engine/sync.js";
import type { OfflineOperationError, OfflineQueue, SyncState } from "./offlineQueue.js";
import { cloneState, InMemoryStorage, type StampStorage, storageKey } from "./storage.js";

export type CheckInOptions = {
  readonly now?: string;
  readonly idempotencyKey?: string;
  readonly sync?: boolean;
};
export type ClaimOptions = {
  readonly now?: string;
  readonly idempotencyKey?: string;
  readonly staffPasscode?: string;
  readonly staffId?: string;
  readonly sync?: boolean;
};
export type ClientError =
  | {
      readonly code:
        | "SPOT_NOT_FOUND"
        | "STAMP_ALREADY_ACQUIRED"
        | "PREREQUISITES_NOT_MET"
        | "INVALID_PROOF";
      readonly spotId: string;
      readonly message: string;
    }
  | { readonly code: "CUSTOM_VALIDATION_FAILED"; readonly spotId: string; readonly message: string }
  | { readonly code: "REWARD_NOT_FOUND"; readonly rewardId: string; readonly message: string }
  | { readonly code: "SYNC_FAILED"; readonly message: string }
  | RewardConsumeError;
export interface CheckInSuccess {
  readonly state: UserRallyState;
  readonly record: StampRecord;
}
export type CheckInResult = Result<CheckInSuccess, ClientError>;
export interface ClaimSuccess {
  readonly state: UserRallyState;
  readonly reward: RewardState;
}
export type ClaimResult = Result<ClaimSuccess, ClientError>;
export type ClientEvent =
  | { readonly type: "checkIn"; readonly result: CheckInResult }
  | { readonly type: "rewardClaimed"; readonly result: ClaimResult }
  | { readonly type: "sync"; readonly state: UserRallyState }
  | { readonly type: "error"; readonly error: ClientError | OfflineOperationError };
export type ClientListener = (state: UserRallyState) => void;
export type ClientEventListener = (event: ClientEvent) => void;

export interface CheckInRequest {
  readonly rallyId: string;
  readonly userId: string | null;
  readonly spotId: string;
  readonly proofData: unknown;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly state: UserRallyState;
}
export interface ClaimRequest {
  readonly rallyId: string;
  readonly userId: string | null;
  readonly rewardId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly options: ClaimOptions;
  readonly state: UserRallyState;
}
export interface SyncAdapter {
  readonly checkIn?: (request: CheckInRequest) => Promise<CheckInResult>;
  readonly claimReward?: (request: ClaimRequest) => Promise<ClaimResult>;
  readonly sync?: (request: {
    readonly rallyId: string;
    readonly userId: string | null;
    readonly state: UserRallyState;
  }) => Promise<UserRallyState>;
}
export interface ClientOptions {
  readonly storage?: StampStorage;
  readonly syncAdapter?: SyncAdapter;
  readonly customValidator?: Validator;
  readonly customValidators?: Readonly<Record<string, Validator>>;
  readonly clock?: () => string;
  readonly userId?: string | null;
  readonly offlineQueue?: OfflineQueue;
}
type StorageOrOptions = StampStorage | ClientOptions;
function isStorage(value: StorageOrOptions): value is StampStorage {
  return "load" in value && "save" in value && "remove" in value;
}
function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function proof(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const item = value as Record<string, unknown>;
    for (const key of ["token", "code", "passcode", "value", "tagId"])
      if (typeof item[key] === "string") return item[key];
  }
  return "";
}
function matches(condition: PublicCheckInCondition, value: unknown): boolean {
  if (condition.type === "gps") {
    if (typeof value !== "object" || value === null) return false;
    const item = value as Record<string, unknown>;
    const latitude = item.latitude;
    const longitude = item.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") return false;
    const radians = (v: number): number => (v * Math.PI) / 180;
    const dLat = radians(latitude - condition.latitude);
    const dLon = radians(longitude - condition.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(condition.latitude)) * Math.cos(radians(latitude)) * Math.sin(dLon / 2) ** 2;
    return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) <= condition.radiusMeters;
  }
  return proof(value).trim() !== "";
}
function emptyState(config: PublicRallyConfig, userId: string | null, now: string): UserRallyState {
  return {
    rallyId: config.id,
    userId,
    records: [],
    rewards: reconcileRewardStates(config.rewards as ReadonlyArray<Reward>, [], 0, now),
    updatedAt: now,
  };
}

export class StampRallyClient {
  readonly #listeners = new Set<ClientListener>();
  readonly #eventListeners = new Set<ClientEventListener>();
  readonly #storage: StampStorage;
  readonly #options: ClientOptions;
  readonly #config: PublicRallyConfig;
  readonly #offlineQueue: OfflineQueue | undefined;
  #userId: string | null;
  #state: UserRallyState | null = null;
  #initialization: Promise<UserRallyState> | null = null;
  #queue: Promise<unknown> = Promise.resolve();
  constructor(config: PublicRallyConfig, storageOrOptions: StorageOrOptions = {}) {
    this.#config = config;
    this.#options = isStorage(storageOrOptions) ? { storage: storageOrOptions } : storageOrOptions;
    this.#storage = this.#options.storage ?? new InMemoryStorage();
    this.#userId = this.#options.userId ?? null;
    this.#offlineQueue = this.#options.offlineQueue;
    this.#offlineQueue?.setSyncResultListener((event) => this.#handleOfflineSyncResult(event));
  }
  getConfig(): RallyConfig {
    return this.#config;
  }
  getState(): UserRallyState | null {
    return this.#state;
  }
  getUserId(): string | null {
    return this.#userId;
  }
  get syncState(): SyncState {
    return this.#offlineQueue?.syncState ?? "idle";
  }
  get pendingCount(): number {
    return this.#offlineQueue?.pendingCount ?? 0;
  }
  subscribe(listener: ClientListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  subscribeEvents(listener: ClientEventListener): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }
  init(): Promise<UserRallyState> {
    return this.initialize();
  }
  initialize(): Promise<UserRallyState> {
    if (this.#state !== null) return Promise.resolve(this.#state);
    if (this.#initialization === null) {
      this.#initialization = (async () => {
        await this.#offlineQueue?.setScope(this.#config.id, this.#userId);
        return this.#storage.load(this.#config.id, this.#userId);
      })()
        .then((state) => {
          const next =
            state === null
              ? emptyState(this.#config, this.#userId, this.#now())
              : this.#reconcile(state);
          this.#state = next;
          this.#emit(next);
          return next;
        })
        .catch((error: unknown) => {
          this.#initialization = null;
          throw error;
        });
    }
    return this.#initialization;
  }
  switchUser(newUserId: string | null): Promise<UserRallyState> {
    return this.#enqueue(async () => {
      if (this.#userId === newUserId && this.#state !== null) return this.#state;
      this.#userId = newUserId;
      this.#state = null;
      this.#initialization = null;
      await this.#offlineQueue?.switchUser(newUserId);
      return this.initialize();
    });
  }
  async getUserState(rallyId: string, userId: string): Promise<UserRallyState | null> {
    return this.#storage.load(rallyId, userId);
  }
  clearUserState(userId = this.#userId): Promise<void> {
    return this.#enqueue(async () => {
      await this.#storage.remove(this.#config.id, userId);
      if (userId === this.#userId) {
        await this.#initializeFresh();
      }
    });
  }
  checkIn(
    spotId: string,
    proofData: unknown,
    options: CheckInOptions = {},
  ): Promise<CheckInResult> {
    return this.#enqueue(async () => {
      const current = await this.initialize();
      const spot = this.#config.spots.find((item) => item.id === spotId);
      if (spot === undefined)
        return this.#fail({ code: "SPOT_NOT_FOUND", spotId, message: "Spot was not found." });
      if (current.records.some((record) => record.stampId === spotId))
        return this.#fail({
          code: "STAMP_ALREADY_ACQUIRED",
          spotId,
          message: "Spot was already claimed.",
        });
      const acquired = new Set(current.records.map((record) => record.stampId));
      if (spot.prerequisites?.some((id) => !acquired.has(id)))
        return this.#fail({
          code: "PREREQUISITES_NOT_MET",
          spotId,
          message: "Prerequisite spots are not complete.",
        });
      for (const condition of spot.conditions) {
        if (condition.type === "custom") {
          const validator =
            this.#options.customValidators?.[condition.validatorName] ??
            this.#options.customValidator;
          if (validator === undefined)
            return this.#fail({
              code: "CUSTOM_VALIDATION_FAILED",
              spotId,
              message: "No custom validator is registered.",
            });
          const context: CustomValidationContext = {
            rallyId: this.#config.id,
            spotId,
            proofData,
            condition: { type: "custom", validatorName: condition.validatorName },
            userState: current,
          };
          const result =
            typeof validator === "function"
              ? await validator(context)
              : await validator.validate(context);
          if (result === false || (typeof result === "object" && !result.valid))
            return this.#fail({
              code: "CUSTOM_VALIDATION_FAILED",
              spotId,
              message:
                typeof result === "object" && result.message !== undefined
                  ? result.message
                  : "Custom validation failed.",
            });
        } else if (!matches(condition, proofData))
          return this.#fail({ code: "INVALID_PROOF", spotId, message: "Verification failed." });
      }
      const now = options.now ?? this.#now();
      const request: CheckInRequest = {
        rallyId: this.#config.id,
        userId: this.#userId,
        spotId,
        proofData,
        idempotencyKey: options.idempotencyKey ?? id("check-in"),
        now,
        state: current,
      };
      const remote = this.#options.syncAdapter?.checkIn;
      if (options.sync !== false && remote !== undefined) {
        try {
          const result = await remote(request);
          return result.ok ? this.#commitCheckIn(result) : this.#fail(result.error);
        } catch (error) {
          if (this.#offlineQueue === undefined) throw error;
          await this.#offlineQueue.enqueueCheckIn(request);
          const record = { stampId: spotId, acquiredAt: now };
          const next = this.#reconcile({
            ...current,
            records: [...current.records, record],
            updatedAt: now,
          });
          await this.#storage.save(next);
          return this.#commitCheckIn({ ok: true, value: { state: next, record } });
        }
      }
      const record = { stampId: spotId, acquiredAt: now };
      const next = this.#reconcile({
        ...current,
        records: [...current.records, record],
        updatedAt: now,
      });
      await this.#storage.save(next);
      return this.#commitCheckIn({ ok: true, value: { state: next, record } });
    });
  }
  claimReward(rewardId: string, options: ClaimOptions = {}): Promise<ClaimResult> {
    return this.#enqueue(async () => {
      const current = await this.initialize();
      const configured = this.#config.rewards.find((item) => item.id === rewardId);
      if (configured === undefined)
        return this.#fail({ code: "REWARD_NOT_FOUND", rewardId, message: "Reward was not found." });
      const now = options.now ?? this.#now();
      const state = current.rewards.find((item) => item.rewardId === rewardId) ?? {
        rewardId,
        status: "LOCKED" as const,
      };
      const local = consumeReward({
        reward: configured as Reward,
        currentState: state,
        now,
        ...(options.staffPasscode === undefined ? {} : { inputPasscode: options.staffPasscode }),
        ...(options.staffId === undefined ? {} : { staffId: options.staffId }),
      });
      if (!local.ok) return this.#fail(local.error);
      const request: ClaimRequest = {
        rallyId: this.#config.id,
        userId: this.#userId,
        rewardId,
        idempotencyKey: options.idempotencyKey ?? id("claim"),
        now,
        options,
        state: current,
      };
      const remote = this.#options.syncAdapter?.claimReward;
      if (options.sync !== false && remote !== undefined) {
        try {
          const result = await remote(request);
          return result.ok ? this.#commitClaim(result) : this.#fail(result.error);
        } catch (error) {
          if (this.#offlineQueue === undefined) throw error;
          await this.#offlineQueue.enqueueClaimReward(request);
          const next = {
            ...current,
            rewards: current.rewards.map((item) =>
              item.rewardId === rewardId ? local.value : item,
            ),
            updatedAt: now,
          };
          await this.#storage.save(next);
          return this.#commitClaim({ ok: true, value: { state: next, reward: local.value } });
        }
      }
      const next = {
        ...current,
        rewards: current.rewards.map((item) => (item.rewardId === rewardId ? local.value : item)),
        updatedAt: now,
      };
      await this.#storage.save(next);
      return this.#commitClaim({ ok: true, value: { state: next, reward: local.value } });
    });
  }
  sync(adapter = this.#options.syncAdapter): Promise<void> {
    return this.#enqueue(async () => {
      const current = await this.initialize();
      if (this.#offlineQueue !== undefined && adapter !== undefined) {
        await this.#offlineQueue.sync(async (operation) => {
          if (operation.kind === "checkIn") {
            if (adapter.checkIn === undefined)
              throw new Error("No check-in sync adapter is configured.");
            return adapter.checkIn(operation.request);
          }
          if (adapter.claimReward === undefined)
            throw new Error("No reward sync adapter is configured.");
          return adapter.claimReward(operation.request);
        });
      }
      if (adapter?.sync === undefined) {
        this.#emitEvent({ type: "sync", state: this.#state ?? current });
        return;
      }
      const serverState = await adapter.sync({
        rallyId: this.#config.id,
        userId: this.#userId,
        state: this.#state ?? current,
      });
      const localState = this.#state ?? current;
      const merged =
        this.#offlineQueue === undefined
          ? serverState
          : resolveRallyStateConflict(serverState, localState, {
              policy: this.#offlineQueue.conflictPolicy,
            });
      const next = this.#reconcile(merged);
      await this.#storage.save(next);
      this.#state = next;
      this.#emit(next);
      this.#emitEvent({ type: "sync", state: next });
    });
  }
  retrySync(): Promise<void> {
    return this.sync();
  }
  reset(): Promise<UserRallyState> {
    return this.#enqueue(async () => {
      await this.#storage.remove(this.#config.id, this.#userId);
      return this.#initializeFresh();
    });
  }
  restore(state: UserRallyState): Promise<UserRallyState> {
    return this.#enqueue(async () => {
      if (state.rallyId !== this.#config.id || state.userId !== this.#userId)
        throw new Error("State belongs to another rally or user.");
      const next = this.#reconcile(state);
      await this.#storage.save(next);
      this.#state = next;
      this.#initialization = Promise.resolve(next);
      this.#emit(next);
      return next;
    });
  }
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  #initializeFresh(): Promise<UserRallyState> {
    const next = emptyState(this.#config, this.#userId, this.#now());
    this.#state = next;
    this.#initialization = Promise.resolve(next);
    this.#emit(next);
    return Promise.resolve(next);
  }
  #reconcile(state: UserRallyState): UserRallyState {
    const ids = new Set(this.#config.spots.map((spot) => spot.id));
    const records = state.records.filter(
      (record, index, all) =>
        ids.has(record.stampId) &&
        all.findIndex((candidate) => candidate.stampId === record.stampId) === index,
    );
    return {
      ...cloneState(state),
      userId: this.#userId,
      records,
      rewards: reconcileRewardStates(
        this.#config.rewards as ReadonlyArray<Reward>,
        state.rewards,
        records.length,
        state.updatedAt,
      ),
    };
  }
  async #handleOfflineSyncResult(
    event: import("./offlineQueue.js").OfflineSyncResultEvent,
  ): Promise<void> {
    if (event.state !== undefined) {
      const next = this.#reconcile(event.state);
      await this.#storage.save(next);
      this.#state = next;
      this.#emit(next);
    }
    if (event.error !== undefined) this.#emitEvent({ type: "error", error: event.error });
    else if (event.result !== undefined && "ok" in event.result && !event.result.ok)
      this.#emitEvent({ type: "error", error: event.result.error });
  }
  #now(): string {
    return this.#options.clock?.() ?? new Date().toISOString();
  }
  #fail(error: ClientError): { readonly ok: false; readonly error: ClientError } {
    this.#emitEvent({ type: "error", error });
    return { ok: false, error };
  }
  #commitCheckIn(result: CheckInResult): CheckInResult {
    if (result.ok) {
      this.#state = result.value.state;
      this.#emit(this.#state);
    }
    this.#emitEvent({ type: "checkIn", result });
    return result;
  }
  #commitClaim(result: ClaimResult): ClaimResult {
    if (result.ok) {
      this.#state = result.value.state;
      this.#emit(this.#state);
    }
    this.#emitEvent({ type: "rewardClaimed", result });
    return result;
  }
  #emit(state: UserRallyState): void {
    for (const listener of this.#listeners) listener(state);
  }
  #emitEvent(event: ClientEvent): void {
    for (const listener of this.#eventListeners) listener(event);
  }
}
export { storageKey };
