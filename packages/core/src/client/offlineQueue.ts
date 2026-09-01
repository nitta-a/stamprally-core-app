import type { AdminRallyConfig, PublicRallyConfig, UserRallyState } from "../domain/index.js";
import type {
  CheckInRequest,
  CheckInResult,
  ClaimRequest,
  ClaimResult,
  ClientError,
} from "./client.js";
import { cloneState } from "./storage.js";
import type { SyncOperationResult, SyncProgressResponse } from "./sync.js";

export type QueueOperationStatus =
  | "PENDING"
  | "IN_FLIGHT"
  | "ACCEPTED"
  | "REJECTED_PERMANENT"
  | "FAILED_RETRYABLE";
export type OfflineStorageCapability =
  | "indexeddb"
  | "localstorage"
  | "memory"
  | "custom"
  | "disabled"
  | "volatile_single_tab";
export type MultiTabSyncCapability = "supported_web_locks" | "disabled_unsafe_environment";
export type QueueCapabilityMode = "persistent" | "volatile_memory";
export type LegacyQueueCapability = "persistent" | "volatile";
export type LegacyQueueCapabilityString =
  | "indexeddb"
  | "localstorage"
  | "memory"
  | "custom"
  | "disabled";

export interface QueueCapabilitiesDetail {
  readonly storageType: "indexeddb" | "localstorage" | "memory" | "custom" | "none";
  readonly isPersistent: boolean;
  readonly multiTabSync: MultiTabSyncCapability;
}
/** The legacy string exposed by `queueCapability`. */
export type QueueCapability = LegacyQueueCapabilityString;
/** @deprecated Use LegacyQueueCapabilityString. */
export type OfflineQueueCapability = LegacyQueueCapabilityString;

/** @deprecated Use the string value of `queueCapability` directly. */
export function getLegacyQueueCapability(
  capability: LegacyQueueCapabilityString | QueueCapabilitiesDetail,
): LegacyQueueCapability {
  if (typeof capability === "string")
    return capability === "memory" || capability === "disabled" ? "volatile" : "persistent";
  return capability.isPersistent ? "persistent" : "volatile";
}

type OfflineQueueStorageCapability = Exclude<
  OfflineStorageCapability,
  "volatile_single_tab" | "disabled"
>;

export type OfflineOperation =
  | {
      readonly kind: "checkIn";
      readonly request: CheckInRequest;
      readonly optimisticState?: UserRallyState;
      readonly status?: QueueOperationStatus;
      readonly attempts?: number;
    }
  | {
      readonly kind: "claimReward";
      readonly request: ClaimRequest;
      readonly optimisticState?: UserRallyState;
      readonly status?: QueueOperationStatus;
      readonly attempts?: number;
    };
export type OfflineResult = CheckInResult | ClaimResult | UserRallyState;
export type SyncState = "idle" | "syncing" | "error";
export type SyncConflictPolicy = "authoritative_replay";
export interface OfflineConflictResult {
  readonly conflict: true;
  readonly localState: UserRallyState;
  readonly serverState: UserRallyState;
}

export interface OfflineQueueStorage {
  load(key: string): Promise<ReadonlyArray<OfflineOperation>>;
  save(key: string, operations: ReadonlyArray<OfflineOperation>): Promise<void>;
  loadRejectedHistory?(key: string): Promise<ReadonlyArray<RejectedOperationHistoryEntry>>;
  saveRejectedHistory?(
    key: string,
    history: ReadonlyArray<RejectedOperationHistoryEntry>,
  ): Promise<void>;
}

export interface OfflineQueueCapabilityWarning {
  readonly type: "STORAGE_CAPABILITY_WARNING";
  readonly storageCapability: "volatile_single_tab" | "memory";
  readonly multiTabSync: "disabled_unsafe_environment";
  readonly isStoragePersistent: boolean;
  readonly message: string;
}

export interface OfflineQueueOptions {
  readonly storage?: OfflineQueueStorage;
  readonly storageLike?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem?(key: string): void;
  } | null;
  readonly key?: string;
  /** Rally scope used by the default durable key. */
  readonly rallyId?: string;
  /** User scope used by the default durable key. */
  readonly userId?: string | null;
  readonly databaseName?: string;
  /** Enables storage-event/BroadcastChannel synchronization when browser APIs exist. */
  readonly synchronizeInstances?: boolean;
  readonly retryOptions?: SyncRetryOptions;
  readonly retry?: SyncRetryOptions;
  /** Alias accepted for callers that configure retry behavior at sync time. */
  readonly syncRetryOptions?: SyncRetryOptions;
}

export interface SyncRetryOptions {
  readonly maxRetries?: number;
  readonly initialIntervalMs?: number;
  readonly backoffMultiplier?: number;
}

export type OfflineSender = (
  operation: OfflineOperation,
) => Promise<OfflineResult | OfflineConflictResult | OfflineOperationResponse>;
export type OfflineOperationStatus = QueueOperationStatus | "REJECTED" | "RETRYABLE_ERROR";
export type OfflineOperationLifecycleStatus = QueueOperationStatus;
export interface OfflineOperationError {
  readonly code: string;
  readonly message: string;
  readonly [key: string]: unknown;
}
export interface RejectedOperationHistoryEntry {
  readonly operation: OfflineOperation;
  readonly reason: OfflineOperationError;
  readonly errorCode: string;
  readonly rejectedAt: string;
  readonly attempts: number;
}
export type RejectedOperation = RejectedOperationHistoryEntry;
export type OfflineOperationResponse =
  | {
      readonly status: "ACCEPTED";
      readonly result?: OfflineResult | OfflineConflictResult;
      readonly state?: UserRallyState;
    }
  | {
      readonly status: "REJECTED_PERMANENT";
      readonly error?: ClientError | OfflineOperationError;
      readonly reason?: ClientError | OfflineOperationError;
      readonly state?: UserRallyState;
    }
  | {
      readonly status: "RETRYABLE_ERROR";
      readonly error?: ClientError | OfflineOperationError;
      readonly reason?: ClientError | OfflineOperationError;
    };
export interface OfflineSyncResultEvent {
  readonly operation: OfflineOperation;
  readonly result?: OfflineResult | OfflineConflictResult;
  readonly status?: OfflineOperationStatus;
  readonly error?: ClientError | OfflineOperationError;
  readonly state?: UserRallyState;
}
export type OfflineSyncResultListener = (event: OfflineSyncResultEvent) => void | Promise<void>;
export type OfflineQueueChangeListener = () => void;

/** Removes only an operation's optimistic changes without mutating its inputs. */
export function rollbackOptimisticOperation(
  state: UserRallyState,
  operation: OfflineOperation,
): UserRallyState {
  const previous = operation.request.state;
  if (operation.kind === "checkIn") {
    const records = state.records.filter(
      (record) =>
        record.stampId !== operation.request.spotId || record.acquiredAt !== operation.request.now,
    );
    const previousRewards = new Map(previous.rewards.map((reward) => [reward.rewardId, reward]));
    const rewards = state.rewards.map((reward) => previousRewards.get(reward.rewardId) ?? reward);
    return { ...cloneState(state), records, rewards, updatedAt: previous.updatedAt };
  }
  const previousReward = previous.rewards.find(
    (reward) => reward.rewardId === operation.request.rewardId,
  );
  const rewards = state.rewards
    .filter(
      (reward) => reward.rewardId !== operation.request.rewardId || previousReward !== undefined,
    )
    .map((reward) =>
      reward.rewardId === operation.request.rewardId && previousReward !== undefined
        ? { ...previousReward }
        : reward,
    );
  const cloned = cloneState(state);
  const { inventory: _inventory, ...stateWithoutInventory } = cloned;
  const previousInventory = previous.inventory;
  return previousInventory === undefined
    ? { ...stateWithoutInventory, rewards, updatedAt: previous.updatedAt }
    : {
        ...stateWithoutInventory,
        rewards,
        inventory: {
          ...previousInventory,
          ...(previousInventory.rewardRemaining === undefined
            ? {}
            : { rewardRemaining: { ...previousInventory.rewardRemaining } }),
        },
        updatedAt: previous.updatedAt,
      };
}

class MemoryQueueStorage implements OfflineQueueStorage {
  readonly #values = new Map<string, ReadonlyArray<OfflineOperation>>();
  readonly #rejected = new Map<string, ReadonlyArray<RejectedOperationHistoryEntry>>();
  async load(key: string): Promise<ReadonlyArray<OfflineOperation>> {
    return this.#values.get(key) ?? [];
  }
  async save(key: string, operations: ReadonlyArray<OfflineOperation>): Promise<void> {
    this.#values.set(key, structuredClone(operations));
  }
  async loadRejectedHistory(key: string): Promise<ReadonlyArray<RejectedOperationHistoryEntry>> {
    return this.#rejected.get(key) ?? [];
  }
  async saveRejectedHistory(
    key: string,
    history: ReadonlyArray<RejectedOperationHistoryEntry>,
  ): Promise<void> {
    this.#rejected.set(key, structuredClone(history));
  }
}

class LocalStorageQueueStorage implements OfflineQueueStorage {
  constructor(readonly storage: NonNullable<OfflineQueueOptions["storageLike"]>) {}
  async load(key: string): Promise<ReadonlyArray<OfflineOperation>> {
    const value = this.storage.getItem(key);
    if (value === null) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ReadonlyArray<OfflineOperation>) : [];
    } catch {
      return [];
    }
  }
  async save(key: string, operations: ReadonlyArray<OfflineOperation>): Promise<void> {
    this.storage.setItem(key, JSON.stringify(operations));
  }
  async loadRejectedHistory(key: string): Promise<ReadonlyArray<RejectedOperationHistoryEntry>> {
    const value = this.storage.getItem(`${key}:rejected-history`);
    if (value === null) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ReadonlyArray<RejectedOperationHistoryEntry>) : [];
    } catch {
      return [];
    }
  }
  async saveRejectedHistory(
    key: string,
    history: ReadonlyArray<RejectedOperationHistoryEntry>,
  ): Promise<void> {
    this.storage.setItem(`${key}:rejected-history`, JSON.stringify(history));
  }
}

export interface IndexedDBOfflineQueueOptions {
  readonly indexedDB?: IDBFactory | null;
  readonly databaseName?: string;
}

export class IndexedDBOfflineQueueStorage implements OfflineQueueStorage {
  readonly #providedFactory: IDBFactory | null | undefined;
  readonly #databaseName: string;
  #databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDBOfflineQueueOptions = {}) {
    this.#providedFactory = options.indexedDB;
    this.#databaseName = options.databaseName ?? "stamprally-offline-queue";
  }
  async load(key: string): Promise<ReadonlyArray<OfflineOperation>> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction("operations", "readonly")
        .objectStore("operations")
        .get(key);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error("Failed to read offline queue."));
    });
  }
  async save(key: string, operations: ReadonlyArray<OfflineOperation>): Promise<void> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("operations", "readwrite");
      transaction.objectStore("operations").put(structuredClone(operations), key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to save offline queue."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Offline queue write aborted."));
    });
  }
  async loadRejectedHistory(key: string): Promise<ReadonlyArray<RejectedOperationHistoryEntry>> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction("operations", "readonly")
        .objectStore("operations")
        .get(`${key}:rejected-history`);
      request.onsuccess = () =>
        resolve(
          Array.isArray(request.result)
            ? (request.result as ReadonlyArray<RejectedOperationHistoryEntry>)
            : [],
        );
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read rejected operation history."));
    });
  }
  async saveRejectedHistory(
    key: string,
    history: ReadonlyArray<RejectedOperationHistoryEntry>,
  ): Promise<void> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("operations", "readwrite");
      transaction
        .objectStore("operations")
        .put(structuredClone(history), `${key}:rejected-history`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to save rejected operation history."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Rejected operation history write aborted."));
    });
  }
  #open(): Promise<IDBDatabase> {
    if (this.#databasePromise !== null) return this.#databasePromise;
    let factory = this.#providedFactory;
    if (factory === undefined)
      factory = (globalThis as { readonly indexedDB?: IDBFactory }).indexedDB;
    if (factory === undefined || factory === null)
      return Promise.reject(new Error("IndexedDB is unavailable in this environment."));
    this.#databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(this.#databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("operations"))
          request.result.createObjectStore("operations");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open offline queue."));
    }).catch((error: unknown) => {
      this.#databasePromise = null;
      throw error;
    });
    return this.#databasePromise;
  }
}

function availableLocalStorage(): NonNullable<OfflineQueueOptions["storageLike"]> | null {
  try {
    const storage = (
      globalThis as {
        readonly localStorage?: OfflineQueueOptions["storageLike"];
      }
    ).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function defaultStorage(databaseName?: string): {
  readonly storage: OfflineQueueStorage;
  readonly capability: OfflineQueueStorageCapability;
} {
  try {
    const indexedDB = (globalThis as { readonly indexedDB?: IDBFactory }).indexedDB;
    if (indexedDB !== undefined)
      return {
        storage: new IndexedDBOfflineQueueStorage({
          indexedDB,
          ...(databaseName === undefined ? {} : { databaseName }),
        }),
        capability: "indexeddb",
      };
    const storage = availableLocalStorage();
    if (storage !== undefined && storage !== null)
      return { storage: new LocalStorageQueueStorage(storage), capability: "localstorage" };
  } catch {
    // Access to localStorage can be denied by privacy mode or a sandbox.
  }
  return { storage: new MemoryQueueStorage(), capability: "memory" };
}

export function offlineOperationId(operation: OfflineOperation): string {
  const identity = operation.request.userId ?? operation.request.anonymousSessionId ?? "anonymous";
  return operation.kind === "checkIn"
    ? `checkIn:${operation.request.rallyId}:${identity}:${operation.request.idempotencyKey}`
    : `claimReward:${operation.request.rallyId}:${identity}:${operation.request.idempotencyKey}`;
}

function requestScope(operation: OfflineOperation): { rallyId: string; userId: string | null } {
  return {
    rallyId: operation.request.rallyId,
    userId: operation.request.userId,
  };
}

function errorValue(value: unknown, fallbackCode: string): OfflineOperationError {
  if (typeof value === "object" && value !== null) {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string")
      return { ...candidate, code: candidate.code, message: candidate.message };
  }
  if (value instanceof Error) return { code: fallbackCode, message: value.message };
  if (typeof value === "string") return { code: fallbackCode, message: value };
  return { code: fallbackCode, message: "Offline operation was rejected." };
}

const DEFAULT_RETRY_OPTIONS: Required<SyncRetryOptions> = {
  maxRetries: 0,
  initialIntervalMs: 250,
  backoffMultiplier: 2,
};

function randomId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** Durable, sequential retry queue for operations created while disconnected. */
export class OfflineQueue {
  #storage: OfflineQueueStorage;
  #queueCapability: OfflineQueueStorageCapability;
  readonly #configuredKey: string | undefined;
  #rallyId: string | undefined;
  #userId: string | null;
  #operations: OfflineOperation[] = [];
  #rejectedHistory: RejectedOperationHistoryEntry[] = [];
  #loaded = false;
  #state: SyncState = "idle";
  #error: Error | null = null;
  #sender: OfflineSender | undefined;
  #syncPromise: Promise<void> | null = null;
  #syncResultListener: OfflineSyncResultListener | undefined;
  #changeListener: OfflineQueueChangeListener | undefined;
  readonly #synchronizeInstances: boolean;
  readonly #retryOptions: Required<SyncRetryOptions>;
  readonly #instanceId = randomId();
  readonly #warnedCapabilityMessages = new Set<string>();
  #capabilityWarningListener: ((event: OfflineQueueCapabilityWarning) => void) | undefined;
  #replayConfig: AdminRallyConfig | PublicRallyConfig | undefined;
  #storageListener: ((event: StorageEvent) => void) | undefined;
  #channel: BroadcastChannel | null = null;

  constructor(options: OfflineQueueOptions = {}) {
    if (options.storage !== undefined) {
      this.#storage = options.storage;
      this.#queueCapability = "custom";
    } else if (options.storageLike !== undefined && options.storageLike !== null) {
      this.#storage = new LocalStorageQueueStorage(options.storageLike);
      this.#queueCapability = "localstorage";
    } else {
      const selected = defaultStorage(options.databaseName);
      this.#storage = selected.storage;
      this.#queueCapability = selected.capability;
    }
    this.#configuredKey = options.key;
    this.#rallyId = options.rallyId;
    this.#userId = options.userId ?? null;
    this.#synchronizeInstances = options.synchronizeInstances ?? true;
    const retryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...(options.retryOptions ?? options.syncRetryOptions ?? options.retry ?? {}),
    };
    this.#retryOptions = {
      maxRetries: Math.max(0, Math.floor(retryOptions.maxRetries)),
      initialIntervalMs: Math.max(0, retryOptions.initialIntervalMs),
      backoffMultiplier: Math.max(1, retryOptions.backoffMultiplier),
    };
    if (this.#synchronizeInstances && this.#hasWebLocks()) this.#subscribeToExternalChanges();
  }

  get syncState(): SyncState {
    return this.#state;
  }
  get pendingCount(): number {
    return this.#operations.length;
  }
  get queueCapability(): QueueCapability {
    return this.#queueCapability;
  }
  get queueCapabilities(): QueueCapabilitiesDetail {
    const storageType = this.#queueCapability;
    const isPersistent = storageType !== "memory";
    return {
      storageType,
      isPersistent,
      multiTabSync: this.#hasWebLocks() ? "supported_web_locks" : "disabled_unsafe_environment",
    };
  }
  get storageCapability(): OfflineStorageCapability {
    if (this.#queueCapability === "memory") return "memory";
    return this.#hasWebLocks() ? this.#queueCapability : "volatile_single_tab";
  }
  get isStoragePersistent(): boolean {
    return this.#queueCapability !== "memory";
  }
  get rejectedHistory(): ReadonlyArray<RejectedOperationHistoryEntry> {
    return this.#rejectedHistory;
  }
  get error(): Error | null {
    return this.#error;
  }
  get operations(): ReadonlyArray<OfflineOperation> {
    return this.#operations;
  }

  get storageKey(): string {
    return this.#storageKey();
  }

  get rallyId(): string | undefined {
    return this.#rallyId;
  }

  get userId(): string | null {
    return this.#userId;
  }

  setSyncResultListener(listener: OfflineSyncResultListener | undefined): void {
    this.#syncResultListener = listener;
  }

  setChangeListener(listener: OfflineQueueChangeListener | undefined): void {
    this.#changeListener = listener;
  }

  setCapabilityWarningListener(
    listener: ((event: OfflineQueueCapabilityWarning) => void) | undefined,
  ): void {
    this.#capabilityWarningListener = listener;
  }

  setReplayConfig(config: AdminRallyConfig | PublicRallyConfig): void {
    this.#replayConfig = config;
  }

  async initialize(): Promise<void> {
    if (this.#loaded) return;
    try {
      const key = this.#storageKey();
      this.#operations = (await this.#storage.load(key)).map(normalizeOperation);
      this.#rejectedHistory =
        (await this.#storage.loadRejectedHistory?.(key))?.map(normalizeRejectedHistory) ?? [];
    } catch (error) {
      if (this.#queueCapability === "memory") throw error;
      this.#storage = new MemoryQueueStorage();
      this.#queueCapability = "memory";
      this.#operations = [];
      this.#rejectedHistory = [];
      this.#warnCapability(
        `Offline queue persistence is unavailable; queued data can be lost after reload (${String(error)}).`,
      );
    }
    if (this.#queueCapability === "memory")
      this.#warnCapability("Offline queue persistence is unavailable; queued data is memory-only.");
    if (this.queueCapabilities.multiTabSync === "disabled_unsafe_environment")
      this.#warnCapability(
        "Web Locks is unavailable; automatic cross-tab synchronization is disabled. Sync must be triggered by the foreground tab.",
      );
    this.#loaded = true;
  }

  /** Releases browser listeners when the queue is no longer used. */
  dispose(): void {
    const windowLike = (globalThis as { readonly window?: Window }).window;
    if (windowLike !== undefined && this.#storageListener !== undefined)
      windowLike.removeEventListener("storage", this.#storageListener);
    this.#storageListener = undefined;
    this.#channel?.close();
    this.#channel = null;
  }

  /** Selects a rally/user queue scope and loads its pending operations. */
  async setScope(rallyId: string, userId: string | null): Promise<void> {
    if (this.#configuredKey !== undefined) {
      this.#rallyId = rallyId;
      this.#userId = userId;
      return this.initialize();
    }
    if (this.#rallyId === rallyId && this.#userId === userId && this.#loaded) return;
    this.#rallyId = rallyId;
    this.#userId = userId;
    this.#operations = [];
    this.#loaded = false;
    await this.initialize();
  }

  async switchUser(newUserId: string | null): Promise<void> {
    if (this.#rallyId === undefined)
      throw new Error("OfflineQueue.switchUser requires a rally scope.");
    await this.setScope(this.#rallyId, newUserId);
  }

  /** Moves pending operations and rejection history from the current user to another account. */
  async migrateUser(newUserId: string): Promise<void> {
    if (this.#rallyId === undefined)
      throw new Error("OfflineQueue.migrateUser requires a rally scope.");
    if (newUserId.trim() === "") throw new Error("OfflineQueue.migrateUser requires a userId.");
    await this.initialize();
    const sourceKey = this.#storageKey();
    const migrateOperation = (operation: OfflineOperation): OfflineOperation => {
      const { anonymousSessionId: _anonymousSessionId, ...request } = operation.request;
      return { ...operation, request: { ...request, userId: newUserId } } as OfflineOperation;
    };
    const migratedOperations = this.#operations.map(migrateOperation);
    const migratedHistory = this.#rejectedHistory.map((entry) => ({
      ...entry,
      operation: migrateOperation(entry.operation),
    }));
    if (this.#configuredKey !== undefined) {
      this.#userId = newUserId;
      this.#operations = migratedOperations;
      this.#rejectedHistory = migratedHistory;
      await this.#storage.save(sourceKey, this.#operations);
      await this.#saveRejectedHistory();
      this.#announceChange();
      return;
    }
    const destinationKey = `stamprally:queue:${this.#rallyId}:${newUserId}`;
    const destinationOperations = (await this.#storage.load(destinationKey)).map(
      normalizeOperation,
    );
    const destinationHistory =
      (await this.#storage.loadRejectedHistory?.(destinationKey))?.map(normalizeRejectedHistory) ??
      [];
    const operations = new Map(
      [...destinationOperations, ...migratedOperations].map((operation) => [
        offlineOperationId(operation),
        operation,
      ]),
    );
    const history = new Map(
      [...destinationHistory, ...migratedHistory].map((entry) => [
        offlineOperationId(entry.operation),
        entry,
      ]),
    );
    await this.#storage.save(sourceKey, []);
    await this.#storage.saveRejectedHistory?.(sourceKey, []);
    await this.#storage.save(destinationKey, [...operations.values()]);
    await this.#storage.saveRejectedHistory?.(destinationKey, [...history.values()]);
    this.#userId = newUserId;
    this.#operations = [...operations.values()];
    this.#rejectedHistory = [...history.values()];
    this.#announceChange();
  }

  setSender(sender: OfflineSender): void {
    this.#sender = sender;
  }

  async enqueue(operation: OfflineOperation): Promise<void> {
    if (this.#configuredKey === undefined) {
      const scope = requestScope(operation);
      if (this.#rallyId === undefined) await this.setScope(scope.rallyId, scope.userId);
      if (this.#rallyId !== scope.rallyId || this.#userId !== scope.userId)
        throw new Error("Offline operation belongs to another rally or user queue.");
    }
    await this.initialize();
    const id = offlineOperationId(operation);
    if (this.#operations.some((item) => offlineOperationId(item) === id)) return;
    this.#operations = [...this.#operations, { ...operation, status: "PENDING", attempts: 0 }];
    await this.#storage.save(this.#storageKey(), this.#operations);
    this.#announceChange();
  }

  async enqueueCheckIn(request: CheckInRequest, optimisticState?: UserRallyState): Promise<void> {
    return this.enqueue({
      kind: "checkIn",
      request,
      ...(optimisticState === undefined ? {} : { optimisticState }),
    });
  }

  async enqueueClaimReward(request: ClaimRequest, optimisticState?: UserRallyState): Promise<void> {
    return this.enqueue({
      kind: "claimReward",
      request,
      ...(optimisticState === undefined ? {} : { optimisticState }),
    });
  }

  async clear(): Promise<void> {
    await this.initialize();
    this.#operations = [];
    await this.#storage.save(this.#storageKey(), this.#operations);
    this.#announceChange();
  }

  async discardRejected(operationId: string): Promise<boolean> {
    await this.initialize();
    const next = this.#rejectedHistory.filter(
      (entry) => offlineOperationId(entry.operation) !== operationId,
    );
    if (next.length === this.#rejectedHistory.length) return false;
    this.#rejectedHistory = next;
    await this.#saveRejectedHistory();
    this.#announceChange();
    return true;
  }

  async retryRejected(operationId: string): Promise<boolean> {
    await this.initialize();
    const entry = this.#rejectedHistory.find(
      (candidate) => offlineOperationId(candidate.operation) === operationId,
    );
    if (entry === undefined) return false;
    if (!this.#operations.some((operation) => offlineOperationId(operation) === operationId))
      this.#operations = [
        ...this.#operations,
        { ...entry.operation, status: "PENDING", attempts: 0 },
      ];
    this.#rejectedHistory = this.#rejectedHistory.filter((candidate) => candidate !== entry);
    await this.#storage.save(this.#storageKey(), this.#operations);
    await this.#saveRejectedHistory();
    this.#announceChange();
    return true;
  }

  async discardRejectedOperation(operationId: string): Promise<boolean> {
    return this.discardRejected(operationId);
  }

  async retryRejectedOperation(operationId: string): Promise<boolean> {
    return this.retryRejected(operationId);
  }

  async clearRejectedHistory(): Promise<void> {
    await this.initialize();
    if (this.#rejectedHistory.length === 0) return;
    this.#rejectedHistory = [];
    await this.#saveRejectedHistory();
    this.#announceChange();
  }

  async sync(sender = this.#sender): Promise<void> {
    await this.initialize();
    if (sender === undefined) throw new Error("OfflineQueue.sync requires a sender.");
    if (this.#syncPromise !== null) return this.#syncPromise;
    this.#sender = sender;
    this.#syncPromise = this.#run(sender).finally(() => {
      this.#syncPromise = null;
    });
    return this.#syncPromise;
  }

  async retrySync(sender = this.#sender): Promise<void> {
    return this.sync(sender);
  }

  /** Applies a server-side batch response while preserving retryable operations. */
  async applySyncProgress(response: SyncProgressResponse): Promise<void> {
    await this.initialize();
    for (const result of response.results)
      await this.#applySyncOperationResult(result, response.currentState);
  }

  async #run(sender: OfflineSender): Promise<void> {
    const locks = (
      globalThis as {
        readonly navigator?: {
          readonly locks?: {
            request<T>(
              name: string,
              options: { ifAvailable: boolean },
              callback: (lock: unknown) => Promise<T>,
            ): Promise<T>;
          };
        };
      }
    ).navigator?.locks;
    if (locks !== undefined && typeof locks.request === "function") {
      let callbackStarted = false;
      try {
        const acquired = await locks.request(
          `stamprally:${this.#storageKey()}:sync`,
          { ifAvailable: true },
          async (lock) => {
            if (lock === null) {
              await this.#reloadFromStorage();
              this.#state = "idle";
              this.#changeListener?.();
              return false;
            }
            callbackStarted = true;
            await this.#runSingleTab(sender);
            return true;
          },
        );
        if (!acquired) return;
        return;
      } catch (error) {
        // Older browsers and test doubles can expose a partial Locks API.
        if (callbackStarted) throw error;
      }
    }
    await this.#runSingleTab(sender);
  }

  async #runSingleTab(sender: OfflineSender): Promise<void> {
    this.#state = "syncing";
    this.#error = null;
    this.#changeListener?.();
    try {
      while (this.#operations.length > 0) {
        const operation = this.#operations[0];
        if (operation === undefined) break;
        if (await this.#rejectFailedPrerequisite(operation)) continue;
        let attempt = 0;
        let response: {
          readonly status: OfflineOperationStatus;
          readonly result?: OfflineResult | OfflineConflictResult;
          readonly state?: UserRallyState;
          readonly error?: ClientError | OfflineOperationError;
          readonly reason?: ClientError | OfflineOperationError;
        };
        while (true) {
          await this.#updateOperationStatus("IN_FLIGHT", attempt);
          try {
            response = this.#normalizeResponse(await sender(operation));
          } catch (cause) {
            response = {
              status: "RETRYABLE_ERROR",
              error: errorValue(cause, "RETRYABLE_ERROR"),
            };
          }
          if (response.status !== "RETRYABLE_ERROR") break;
          const error = errorValue(response.error ?? response.reason, "RETRYABLE_ERROR");
          await this.#updateOperationStatus("PENDING", attempt + 1);
          await this.#syncResultListener?.({ operation, status: response.status, error });
          if (attempt >= this.#retryOptions.maxRetries) {
            await this.#updateOperationStatus("FAILED_RETRYABLE", attempt + 1);
            throw new Error(error.message);
          }
          const interval =
            this.#retryOptions.initialIntervalMs * this.#retryOptions.backoffMultiplier ** attempt;
          await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, interval)));
          attempt += 1;
        }
        const result = response.result;
        const state =
          response.state ??
          (result !== undefined && "conflict" in result && result.conflict === true
            ? result.serverState
            : result !== undefined && "ok" in result && result.ok
              ? result.value.state
              : undefined);
        const error =
          response.status === "REJECTED_PERMANENT"
            ? errorValue(
                response.error ??
                  response.reason ??
                  (result !== undefined && "ok" in result && !result.ok ? result.error : undefined),
                "REJECTED_PERMANENT",
              )
            : undefined;
        await this.#updateOperationStatus(
          response.status === "ACCEPTED" ? "ACCEPTED" : "REJECTED_PERMANENT",
          attempt + 1,
        );
        const eventState = state;
        if (response.status === "REJECTED_PERMANENT" && error !== undefined) {
          this.#rejectedHistory = [
            ...this.#rejectedHistory,
            {
              operation: { ...operation, status: "REJECTED_PERMANENT", attempts: attempt + 1 },
              reason: error,
              errorCode: error.code,
              rejectedAt: new Date().toISOString(),
              attempts: attempt + 1,
            },
          ];
          await this.#saveRejectedHistory();
        }
        this.#operations = this.#operations.slice(1);
        await this.#storage.save(this.#storageKey(), this.#operations);
        this.#announceChange();
        await this.#syncResultListener?.({
          operation,
          ...(result === undefined ? {} : { result }),
          status: response.status,
          ...(error === undefined ? {} : { error }),
          ...(eventState === undefined ? {} : { state: eventState }),
        });
      }
      this.#state = "idle";
      this.#changeListener?.();
    } catch (cause) {
      this.#state = "error";
      this.#error = cause instanceof Error ? cause : new Error(String(cause));
      this.#changeListener?.();
      throw this.#error;
    }
  }

  async #updateOperationStatus(status: QueueOperationStatus, attempts: number): Promise<void> {
    const operation = this.#operations[0];
    if (operation === undefined) return;
    this.#operations = [{ ...operation, status, attempts }, ...this.#operations.slice(1)];
    await this.#storage.save(this.#storageKey(), this.#operations);
    this.#announceChange();
  }

  async #applySyncOperationResult(
    result: SyncOperationResult,
    currentState: UserRallyState,
  ): Promise<void> {
    const operationIndex = this.#operations.findIndex(
      (operation) => offlineOperationId(operation) === result.operationId,
    );
    const operation = operationIndex < 0 ? undefined : this.#operations[operationIndex];
    if (operation === undefined) return;
    if (result.status === "FAILED_RETRYABLE") {
      const attempts = (operation.attempts ?? 0) + 1;
      this.#operations = [
        ...this.#operations.slice(0, operationIndex),
        { ...operation, status: "FAILED_RETRYABLE", attempts },
        ...this.#operations.slice(operationIndex + 1),
      ];
      await this.#storage.save(this.#storageKey(), this.#operations);
      this.#announceChange();
      await this.#syncResultListener?.({
        operation,
        status: "RETRYABLE_ERROR",
        error: { code: "FAILED_RETRYABLE", message: result.error },
      });
      return;
    }

    this.#operations = [
      ...this.#operations.slice(0, operationIndex),
      ...this.#operations.slice(operationIndex + 1),
    ];
    if (result.status === "REJECTED_PERMANENT") {
      const attempts = (operation.attempts ?? 0) + 1;
      const error: OfflineOperationError = {
        code: result.errorCode,
        message: result.reason,
      };
      this.#rejectedHistory = [
        ...this.#rejectedHistory,
        {
          operation: { ...operation, status: "REJECTED_PERMANENT", attempts },
          reason: error,
          errorCode: result.errorCode,
          rejectedAt: new Date().toISOString(),
          attempts,
        },
      ];
      await this.#saveRejectedHistory();
    }
    await this.#storage.save(this.#storageKey(), this.#operations);
    this.#announceChange();
    await this.#syncResultListener?.({
      operation,
      status: result.status,
      state: currentState,
      ...(result.status === "REJECTED_PERMANENT"
        ? { error: { code: result.errorCode, message: result.reason } }
        : {}),
    });
  }

  async #rejectFailedPrerequisite(operation: OfflineOperation): Promise<boolean> {
    if (operation.kind !== "checkIn" || this.#replayConfig === undefined) return false;
    const spot = this.#replayConfig.spots.find(
      (candidate) => candidate.id === operation.request.spotId,
    );
    if (spot === undefined) return false;
    const failedSpots = new Set(
      [
        ...this.#rejectedHistory.map((entry) => entry.operation),
        ...this.#operations.filter((candidate) => candidate.status === "REJECTED_PERMANENT"),
      ]
        .filter((candidate) => candidate.kind === "checkIn")
        .map((candidate) => (candidate.kind === "checkIn" ? candidate.request.spotId : undefined))
        .filter((spotId): spotId is string => spotId !== undefined),
    );
    if (!spot.prerequisites?.some((prerequisite) => failedSpots.has(prerequisite))) return false;
    const error: OfflineOperationError = {
      code: "REJECTED_PREREQUISITE_FAILED",
      message: "A prerequisite operation was rejected by the server.",
    };
    const rejectedOperation = { ...operation, status: "REJECTED_PERMANENT" as const };
    this.#rejectedHistory = [
      ...this.#rejectedHistory,
      {
        operation: rejectedOperation,
        reason: error,
        errorCode: error.code,
        rejectedAt: new Date().toISOString(),
        attempts: operation.attempts ?? 0,
      },
    ];
    this.#operations = this.#operations.slice(1);
    await this.#storage.save(this.#storageKey(), this.#operations);
    await this.#saveRejectedHistory();
    this.#announceChange();
    await this.#syncResultListener?.({
      operation,
      status: "REJECTED_PERMANENT",
      error,
    });
    return true;
  }

  #subscribeToExternalChanges(): void {
    const windowLike = (globalThis as { readonly window?: Window }).window;
    if (windowLike !== undefined) {
      this.#storageListener = (event) => {
        if (
          event.key === this.#storageKey() ||
          event.key === `${this.#storageKey()}:rejected-history`
        )
          void this.#reloadFromStorage();
      };
      windowLike.addEventListener("storage", this.#storageListener);
    }
    const Channel = (globalThis as { readonly BroadcastChannel?: typeof BroadcastChannel })
      .BroadcastChannel;
    if (Channel !== undefined) {
      try {
        this.#channel = new Channel("stamprally:queue-sync");
        this.#channel.addEventListener("message", (event: MessageEvent<unknown>) => {
          if (
            typeof event.data === "object" &&
            event.data !== null &&
            "key" in event.data &&
            (event.data as { readonly key?: unknown }).key === this.#storageKey()
          )
            void this.#reloadFromStorage();
        });
      } catch {
        this.#channel = null;
      }
    }
  }

  #announceChange(): void {
    this.#changeListener?.();
    this.#channel?.postMessage({
      type: "change",
      key: this.#storageKey(),
      owner: this.#instanceId,
    });
  }

  async #reloadFromStorage(): Promise<void> {
    if (this.#state === "syncing") return;
    try {
      const key = this.#storageKey();
      this.#operations = (await this.#storage.load(key)).map(normalizeOperation);
      this.#rejectedHistory =
        (await this.#storage.loadRejectedHistory?.(key))?.map(normalizeRejectedHistory) ??
        this.#rejectedHistory;
      this.#loaded = true;
    } catch {
      // A transient storage failure must not destroy the in-memory queue.
    }
  }

  #storageKey(): string {
    if (this.#configuredKey !== undefined) return this.#configuredKey;
    return `stamprally:queue:${this.#rallyId ?? "unscoped"}:${this.#userId ?? "anonymous"}`;
  }

  #normalizeResponse(value: OfflineResult | OfflineConflictResult | OfflineOperationResponse): {
    readonly status: OfflineOperationStatus;
    readonly result?: OfflineResult | OfflineConflictResult;
    readonly state?: UserRallyState;
    readonly error?: ClientError | OfflineOperationError;
    readonly reason?: ClientError | OfflineOperationError;
  } {
    if ("ok" in value) {
      if (value.ok === false) {
        if ("status" in value && value.status === "RETRYABLE_ERROR")
          return { status: "RETRYABLE_ERROR", error: errorValue(value.error, "RETRYABLE_ERROR") };
        return { status: "REJECTED_PERMANENT", result: value };
      }
      return { status: "ACCEPTED", result: value };
    }
    if ("status" in value) {
      if (value.status === "ACCEPTED") return value;
      return value;
    }
    return { status: "ACCEPTED", result: value };
  }

  async #saveRejectedHistory(): Promise<void> {
    await this.#storage.saveRejectedHistory?.(this.#storageKey(), this.#rejectedHistory);
  }

  #warnCapability(message: string): void {
    if (this.#warnedCapabilityMessages.has(message)) return;
    this.#warnedCapabilityMessages.add(message);
    console.warn(`[@stamprally/core] ${message}`);
    this.#capabilityWarningListener?.({
      type: "STORAGE_CAPABILITY_WARNING",
      storageCapability: this.storageCapability === "memory" ? "memory" : "volatile_single_tab",
      multiTabSync: "disabled_unsafe_environment",
      isStoragePersistent: this.isStoragePersistent,
      message,
    });
  }

  #hasWebLocks(): boolean {
    if ((globalThis as { readonly window?: unknown }).window === undefined) return false;
    const locks = (
      globalThis as {
        readonly navigator?: {
          readonly locks?: { readonly request?: unknown };
        };
      }
    ).navigator?.locks;
    return locks !== undefined && typeof locks.request === "function";
  }
}

function normalizeOperation(operation: OfflineOperation): OfflineOperation {
  const status = (operation as { readonly status?: string }).status;
  return {
    ...operation,
    status:
      status === "IN_FLIGHT" || status === "REJECTED"
        ? "PENDING"
        : status === "RETRYABLE_ERROR"
          ? "FAILED_RETRYABLE"
          : (operation.status ?? "PENDING"),
    attempts: operation.attempts ?? 0,
  };
}

function normalizeRejectedHistory(
  entry: RejectedOperationHistoryEntry,
): RejectedOperationHistoryEntry {
  return {
    ...entry,
    operation: normalizeOperation(entry.operation),
    reason: errorValue(entry.reason, "REJECTED_PERMANENT"),
    errorCode: entry.errorCode || entry.reason.code,
    rejectedAt: entry.rejectedAt || new Date(0).toISOString(),
    attempts: entry.attempts ?? entry.operation.attempts ?? 0,
  };
}

export { MemoryQueueStorage as InMemoryOfflineQueueStorage };
