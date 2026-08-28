import type { Result } from "../domain/errors.js";
import type {
  AdminReward,
  PublicCheckInCondition,
  PublicRallyConfig,
  PublicReward,
  RewardState,
  StampRallyState,
  StampRecord,
} from "../domain/index.js";
import { consumeReward, type RewardConsumeError, reconcileRewardStates } from "../engine/index.js";
import { cloneState, InMemoryStorage, type StampStorage } from "./storage.js";

export type UserRallyState = StampRallyState;

export type CustomValidator = (context: {
  readonly spotId: string;
  readonly proofData: unknown;
  readonly config: PublicRallyConfig;
  readonly userState: UserRallyState;
}) => Promise<{ readonly success: boolean; readonly error?: string }>;

export interface CheckInOptions {
  readonly now?: string;
  readonly idempotencyKey?: string;
  readonly sync?: boolean;
}

export interface ClaimOptions {
  readonly now?: string;
  readonly idempotencyKey?: string;
  readonly staffPasscode?: string;
  readonly staffId?: string;
  readonly sync?: boolean;
}

export interface UniversalClientRequest {
  readonly rallyId: string;
  readonly spotId: string;
  readonly proofData: unknown;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly state: UserRallyState;
}

export interface UniversalClaimRequest {
  readonly rallyId: string;
  readonly rewardId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly options: ClaimOptions;
  readonly state: UserRallyState;
}

export type UniversalClientError =
  | { readonly code: "SPOT_NOT_FOUND"; readonly spotId: string; readonly message: string }
  | { readonly code: "STAMP_ALREADY_ACQUIRED"; readonly spotId: string; readonly message: string }
  | { readonly code: "PREREQUISITES_NOT_MET"; readonly spotId: string; readonly message: string }
  | { readonly code: "INVALID_PROOF"; readonly spotId: string; readonly message: string }
  | { readonly code: "CUSTOM_VALIDATION_FAILED"; readonly spotId: string; readonly message: string }
  | { readonly code: "REWARD_NOT_FOUND"; readonly rewardId: string; readonly message: string }
  | { readonly code: "SYNC_FAILED"; readonly message: string }
  | { readonly code: "REMOTE_ERROR"; readonly message: string }
  | RewardConsumeError;

export interface CheckInSuccess {
  readonly state: UserRallyState;
  readonly record: StampRecord;
}

export type UniversalCheckInResult = Result<CheckInSuccess, UniversalClientError>;
export type ClientCheckInResult = UniversalCheckInResult;

export interface ClaimSuccess {
  readonly state: UserRallyState;
  readonly reward: RewardState;
}

export type UniversalClaimResult = Result<ClaimSuccess, UniversalClientError>;
export type ClaimResult = UniversalClaimResult;
export type ClientClaimResult = UniversalClaimResult;

export type UniversalClientEvent =
  | { readonly type: "checkIn"; readonly result: UniversalCheckInResult }
  | { readonly type: "rewardClaimed"; readonly result: UniversalClaimResult }
  | { readonly type: "sync"; readonly state: UserRallyState }
  | { readonly type: "error"; readonly error: UniversalClientError };

export type UniversalClientListener = (state: UserRallyState) => void;
export type UniversalClientEventListener = (event: UniversalClientEvent) => void;

export interface UniversalClientSyncAdapter {
  readonly checkIn?: (request: UniversalClientRequest) => Promise<UniversalCheckInResult>;
  readonly claimReward?: (request: UniversalClaimRequest) => Promise<UniversalClaimResult>;
  readonly sync?: (request: {
    readonly rallyId: string;
    readonly state: UserRallyState;
  }) => Promise<UserRallyState>;
}

export interface UniversalStampRallyClientOptions {
  readonly storage?: StampStorage;
  readonly syncAdapter?: UniversalClientSyncAdapter;
  readonly customValidator?: CustomValidator;
  readonly customValidators?: Readonly<Record<string, CustomValidator>>;
  readonly clock?: () => string;
}

function isStorage(value: UniversalClientOptionsOrStorage): value is StampStorage {
  return "load" in value && "save" in value && "remove" in value;
}

type UniversalClientOptionsOrStorage = UniversalStampRallyClientOptions | StampStorage;

function randomId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function now(): string {
  return new Date().toISOString();
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const first = Object.values(value).find((item) => typeof item === "string");
    if (typeof first === "string") return first;
  }
  return "";
}

function proofString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["token", "code", "passcode", "value"]) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  return "";
}

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

function conditionMatches(condition: PublicCheckInCondition, proofData: unknown): boolean {
  switch (condition.type) {
    case "qr":
      return proofString(proofData).trim() !== "";
    case "passcode":
      return proofString(proofData).trim() !== "";
    case "gps": {
      if (typeof proofData !== "object" || proofData === null) return false;
      const value = proofData as Record<string, unknown>;
      const latitude = typeof value.latitude === "number" ? value.latitude : Number.NaN;
      const longitude = typeof value.longitude === "number" ? value.longitude : Number.NaN;
      return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        distanceMeters(condition.latitude, condition.longitude, latitude, longitude) <=
          condition.radiusMeters
      );
    }
    case "custom":
      return true;
  }
}

function asReward(reward: PublicReward): AdminReward & { readonly description: string } {
  return { ...reward, description: text(reward.description) };
}

function initialState(config: PublicRallyConfig, timestamp: string): UserRallyState {
  const rewards = config.rewards.map(asReward);
  return {
    rallyId: config.id,
    records: [],
    rewards: reconcileRewardStates(rewards, [], 0, timestamp),
    updatedAt: timestamp,
  };
}

/**
 * Storage- and framework-independent client state machine for a public rally.
 * All operations create new state snapshots and notify subscribers after persistence.
 */
export class UniversalStampRallyClient {
  readonly #listeners = new Set<UniversalClientListener>();
  readonly #eventListeners = new Set<UniversalClientEventListener>();
  readonly #config: PublicRallyConfig;
  readonly #storage: StampStorage;
  readonly #options: UniversalStampRallyClientOptions;
  #state: UserRallyState | null = null;
  #initialization: Promise<UserRallyState> | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    config: PublicRallyConfig,
    storageOrOptions: UniversalClientOptionsOrStorage = {},
    clock?: () => string,
  ) {
    this.#config = config;
    this.#options = isStorage(storageOrOptions)
      ? { storage: storageOrOptions, ...(clock === undefined ? {} : { clock }) }
      : storageOrOptions;
    this.#storage = this.#options.storage ?? new InMemoryStorage();
  }

  getConfig(): PublicRallyConfig {
    return this.#config;
  }

  getState(): UserRallyState | null {
    return this.#state;
  }

  subscribe(listener: UniversalClientListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  subscribeEvents(listener: UniversalClientEventListener): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  init(): Promise<UserRallyState> {
    return this.initialize();
  }

  initialize(): Promise<UserRallyState> {
    if (this.#state !== null) return Promise.resolve(this.#state);
    if (this.#initialization === null) {
      this.#initialization = this.#storage
        .load(this.#config.id)
        .then((stored) => {
          const state =
            stored === null ? initialState(this.#config, this.#now()) : this.#reconcile(stored);
          this.#state = state;
          this.#emit(state);
          return state;
        })
        .catch((error: unknown) => {
          this.#initialization = null;
          throw error;
        });
    }
    return this.#initialization;
  }

  checkIn(
    spotId: string,
    proofData: unknown,
    options: CheckInOptions = {},
  ): Promise<UniversalCheckInResult> {
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
          if (validator !== undefined) {
            try {
              const validation = await validator({
                spotId,
                proofData,
                config: this.#config,
                userState: current,
              });
              if (!validation.success)
                return this.#fail({
                  code: "CUSTOM_VALIDATION_FAILED",
                  spotId,
                  message: validation.error ?? "Custom validation failed.",
                });
            } catch (error: unknown) {
              return this.#fail({
                code: "CUSTOM_VALIDATION_FAILED",
                spotId,
                message: error instanceof Error ? error.message : "Custom validation failed.",
              });
            }
          } else {
            return this.#fail({
              code: "CUSTOM_VALIDATION_FAILED",
              spotId,
              message: "No custom validator is registered.",
            });
          }
        } else if (!conditionMatches(condition, proofData)) {
          return this.#fail({ code: "INVALID_PROOF", spotId, message: "Verification failed." });
        }
      }
      const timestamp = options.now ?? this.#now();
      const request: UniversalClientRequest = {
        rallyId: this.#config.id,
        spotId,
        proofData,
        idempotencyKey: options.idempotencyKey ?? randomId("check-in"),
        now: timestamp,
        state: current,
      };
      const remote = this.#options.syncAdapter?.checkIn;
      if (options.sync !== false && remote !== undefined) {
        const result = await remote(request);
        if (!result.ok) return this.#fail(result.error);
        return this.#commitCheckIn(result.value.state, result);
      }
      const record: StampRecord = { stampId: spotId, acquiredAt: timestamp };
      const next = this.#reconcile({
        ...current,
        records: [...current.records, record],
        updatedAt: timestamp,
      });
      await this.#storage.save(next);
      return this.#commitCheckIn(next, { ok: true, value: { state: next, record } });
    });
  }

  claimReward(rewardId: string, options: ClaimOptions = {}): Promise<UniversalClaimResult> {
    return this.#enqueue(async () => {
      const current = await this.initialize();
      const configured = this.#config.rewards.find((item) => item.id === rewardId);
      if (configured === undefined)
        return this.#fail({ code: "REWARD_NOT_FOUND", rewardId, message: "Reward was not found." });
      const timestamp = options.now ?? this.#now();
      const state = current.rewards?.find((item) => item.rewardId === rewardId) ?? {
        rewardId,
        status: "LOCKED" as const,
      };
      const local = consumeReward({
        reward: asReward(configured),
        currentState: state,
        now: timestamp,
        ...(options.staffPasscode === undefined ? {} : { inputPasscode: options.staffPasscode }),
        ...(options.staffId === undefined ? {} : { staffId: options.staffId }),
      });
      if (!local.ok) return this.#fail(local.error);
      const request: UniversalClaimRequest = {
        rallyId: this.#config.id,
        rewardId,
        idempotencyKey: options.idempotencyKey ?? randomId("claim"),
        now: timestamp,
        options,
        state: current,
      };
      const remote = this.#options.syncAdapter?.claimReward;
      if (options.sync !== false && remote !== undefined) {
        const result = await remote(request);
        if (!result.ok) return this.#fail(result.error);
        return this.#commitClaim(result.value.state, result);
      }
      const nextRewards = (current.rewards ?? []).map((item) =>
        item.rewardId === rewardId ? local.value : item,
      );
      const next = { ...current, rewards: nextRewards, updatedAt: timestamp };
      await this.#storage.save(next);
      return this.#commitClaim(next, { ok: true, value: { state: next, reward: local.value } });
    });
  }

  sync(adapter: UniversalClientSyncAdapter = this.#options.syncAdapter ?? {}): Promise<void> {
    return this.#enqueue(async () => {
      const current = await this.initialize();
      if (adapter.sync === undefined) {
        this.#emitEvent({ type: "sync", state: current });
        return;
      }
      try {
        const next = this.#reconcile(
          await adapter.sync({ rallyId: this.#config.id, state: current }),
        );
        await this.#storage.save(next);
        this.#state = next;
        this.#emit(next);
        this.#emitEvent({ type: "sync", state: next });
      } catch (error: unknown) {
        const failure: UniversalClientError = {
          code: "SYNC_FAILED",
          message: error instanceof Error ? error.message : String(error),
        };
        this.#emitEvent({ type: "error", error: failure });
        throw error;
      }
    });
  }

  #now(): string {
    return this.#options.clock?.() ?? now();
  }

  #reconcile(state: UserRallyState): UserRallyState {
    const ids = new Set(this.#config.spots.map((spot) => spot.id));
    const seen = new Set<string>();
    const records = state.records.filter(
      (record) => ids.has(record.stampId) && !seen.has(record.stampId) && seen.add(record.stampId),
    );
    return {
      ...cloneState(state),
      records,
      rewards: reconcileRewardStates(
        this.#config.rewards.map(asReward),
        state.rewards ?? [],
        records.length,
        state.updatedAt,
      ),
    };
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  #fail(error: UniversalClientError): { readonly ok: false; readonly error: UniversalClientError } {
    this.#emitEvent({ type: "error", error });
    return { ok: false, error };
  }

  #commitCheckIn(state: UserRallyState, result: UniversalCheckInResult): UniversalCheckInResult {
    this.#state = state;
    this.#emit(state);
    this.#emitEvent({ type: "checkIn", result });
    return result;
  }

  #commitClaim(state: UserRallyState, result: UniversalClaimResult): UniversalClaimResult {
    this.#state = state;
    this.#emit(state);
    this.#emitEvent({ type: "rewardClaimed", result });
    return result;
  }

  #emit(state: UserRallyState): void {
    for (const listener of this.#listeners) listener(state);
  }
  #emitEvent(event: UniversalClientEvent): void {
    for (const listener of this.#eventListeners) listener(event);
  }
}
