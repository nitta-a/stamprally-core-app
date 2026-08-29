import type { UserRallyState } from "../domain/index.js";
import { resolveRallyStateConflict } from "../engine/sync.js";
import type {
  CheckInRequest,
  CheckInResult,
  ClaimRequest,
  ClaimResult,
  ClientError,
} from "./client.js";

export type QueueOperationStatus =
  | "PENDING"
  | "IN_FLIGHT"
  | "ACCEPTED"
  | "REJECTED_PERMANENT"
  | "FAILED_RETRYABLE";
export type OfflineQueueCapability = "indexeddb" | "localstorage" | "memory" | "custom";

export type OfflineOperation =
  | {
      readonly kind: "checkIn";
      readonly request: CheckInRequest;
      readonly status?: QueueOperationStatus;
      readonly attempts?: number;
    }
  | {
      readonly kind: "claimReward";
      readonly request: ClaimRequest;
      readonly status?: QueueOperationStatus;
      readonly attempts?: number;
    };
export type OfflineResult = CheckInResult | ClaimResult | UserRallyState;
export type SyncState = "idle" | "syncing" | "error";
export type SyncConflictPolicy = "server_wins" | "merge";
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
  readonly conflictPolicy?: SyncConflictPolicy;
  readonly onSyncConflict?:
    | SyncConflictPolicy
    | ((context: OfflineConflict) => SyncConflictPolicy | Promise<SyncConflictPolicy>);
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

export interface OfflineConflict {
  readonly operation: OfflineOperation;
  readonly localState: UserRallyState;
  readonly serverState: UserRallyState;
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
  readonly capability: OfflineQueueCapability;
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

const syncLocks = new Map<string, { readonly owner: string; readonly expiresAt: number }>();
const SYNC_LOCK_TTL_MS = 30_000;
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
  #queueCapability: OfflineQueueCapability;
  readonly #configuredKey: string | undefined;
  #rallyId: string | undefined;
  #userId: string | null;
  readonly #conflictPolicy: SyncConflictPolicy;
  readonly #onSyncConflict: OfflineQueueOptions["onSyncConflict"];
  #operations: OfflineOperation[] = [];
  #rejectedHistory: RejectedOperationHistoryEntry[] = [];
  #loaded = false;
  #state: SyncState = "idle";
  #error: Error | null = null;
  #sender: OfflineSender | undefined;
  #syncPromise: Promise<void> | null = null;
  #syncResultListener: OfflineSyncResultListener | undefined;
  readonly #synchronizeInstances: boolean;
  readonly #retryOptions: Required<SyncRetryOptions>;
  readonly #instanceId = randomId();
  readonly #lockStorage: NonNullable<OfflineQueueOptions["storageLike"]> | null;
  readonly #observedLocks = new Map<
    string,
    { readonly owner: string; readonly expiresAt: number }
  >();
  #warnedMemoryLock = false;
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
    this.#conflictPolicy = options.conflictPolicy ?? "server_wins";
    this.#onSyncConflict = options.onSyncConflict;
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
    this.#lockStorage = options.storageLike ?? availableLocalStorage();
    if (this.#synchronizeInstances) this.#subscribeToExternalChanges();
  }

  get syncState(): SyncState {
    return this.#state;
  }
  get pendingCount(): number {
    return this.#operations.length;
  }
  get queueCapability(): OfflineQueueCapability {
    return this.#queueCapability;
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
  get conflictPolicy(): SyncConflictPolicy {
    return this.#conflictPolicy;
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
      this.#warnMemoryLock(
        `Offline queue persistence is unavailable; queued data can be lost after reload (${String(error)}).`,
      );
    }
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
    this.#releaseSyncLock();
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

  async enqueueCheckIn(request: CheckInRequest): Promise<void> {
    return this.enqueue({ kind: "checkIn", request });
  }

  async enqueueClaimReward(request: ClaimRequest): Promise<void> {
    return this.enqueue({ kind: "claimReward", request });
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
              return false;
            }
            callbackStarted = true;
            await this.#runWithStorageLock(sender);
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
    if (this.#lockStorage === null)
      this.#warnMemoryLock(
        "No cross-tab storage lock is available; offline sync is single-tab only.",
      );
    await this.#runWithStorageLock(sender);
  }

  async #runWithStorageLock(sender: OfflineSender): Promise<void> {
    this.#state = "syncing";
    this.#error = null;
    if (!this.#acquireSyncLock()) {
      await this.#reloadFromStorage();
      this.#state = "idle";
      return;
    }
    try {
      while (this.#operations.length > 0) {
        const operation = this.#operations[0];
        if (operation === undefined) break;
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
    } catch (cause) {
      this.#state = "error";
      this.#error = cause instanceof Error ? cause : new Error(String(cause));
      throw this.#error;
    } finally {
      this.#releaseSyncLock();
    }
  }

  async #updateOperationStatus(status: QueueOperationStatus, attempts: number): Promise<void> {
    const operation = this.#operations[0];
    if (operation === undefined) return;
    this.#operations = [{ ...operation, status, attempts }, ...this.#operations.slice(1)];
    await this.#storage.save(this.#storageKey(), this.#operations);
    this.#announceChange();
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
          if (typeof event.data === "object" && event.data !== null) {
            const data = event.data as {
              readonly type?: unknown;
              readonly lockKey?: unknown;
              readonly owner?: unknown;
              readonly expiresAt?: unknown;
            };
            if (data.type === "lock" && data.lockKey === this.#lockKey()) {
              this.#observedLocks.set(data.lockKey, {
                owner: typeof data.owner === "string" ? data.owner : "unknown",
                expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : 0,
              });
              return;
            }
            if (data.type === "unlock" && data.lockKey === this.#lockKey()) {
              this.#observedLocks.delete(data.lockKey);
              return;
            }
          }
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

  #lockKey(): string {
    return `${this.#storageKey()}:sync-lock`;
  }

  #acquireSyncLock(): boolean {
    const key = this.#lockKey();
    const now = Date.now();
    const local = syncLocks.get(key);
    if (local !== undefined && local.expiresAt > now && local.owner !== this.#instanceId)
      return false;
    const observed = this.#observedLocks.get(key);
    if (observed !== undefined && observed.expiresAt > now && observed.owner !== this.#instanceId)
      return false;
    if (this.#lockStorage !== null) {
      try {
        const existing = this.#lockStorage.getItem(key);
        if (existing !== null) {
          const parsed: unknown = JSON.parse(existing);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            typeof (parsed as { readonly expiresAt?: unknown }).expiresAt === "number" &&
            (parsed as { readonly expiresAt: number }).expiresAt > now &&
            (parsed as { readonly owner?: unknown }).owner !== this.#instanceId
          )
            return false;
        }
        this.#lockStorage.setItem(
          key,
          JSON.stringify({ owner: this.#instanceId, expiresAt: now + SYNC_LOCK_TTL_MS }),
        );
        this.#channel?.postMessage({
          type: "lock",
          lockKey: key,
          owner: this.#instanceId,
          expiresAt: now + SYNC_LOCK_TTL_MS,
        });
      } catch {
        this.#warnMemoryLock("Persistent lock access failed; offline sync is single-tab only.");
      }
    }
    syncLocks.set(key, { owner: this.#instanceId, expiresAt: now + SYNC_LOCK_TTL_MS });
    return true;
  }

  #releaseSyncLock(): void {
    const key = this.#lockKey();
    const current = syncLocks.get(key);
    if (current?.owner === this.#instanceId) syncLocks.delete(key);
    if (this.#lockStorage !== null) {
      try {
        const value = this.#lockStorage.getItem(key);
        if (
          value !== null &&
          (JSON.parse(value) as { readonly owner?: unknown }).owner === this.#instanceId
        )
          this.#lockStorage.removeItem?.(key);
        this.#channel?.postMessage({ type: "unlock", lockKey: key, owner: this.#instanceId });
      } catch {
        // Lock expiry protects against an unreadable lock record.
      }
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

  async resolveConflict(
    operation: OfflineOperation,
    localState: UserRallyState,
    serverState: UserRallyState,
  ): Promise<UserRallyState> {
    const configured = this.#onSyncConflict;
    const policy =
      (typeof configured === "function"
        ? await configured({ operation, localState, serverState })
        : configured) ?? this.#conflictPolicy;
    return resolveRallyStateConflict(serverState, localState, { policy });
  }

  async #saveRejectedHistory(): Promise<void> {
    await this.#storage.saveRejectedHistory?.(this.#storageKey(), this.#rejectedHistory);
  }

  #warnMemoryLock(message: string): void {
    if (this.#warnedMemoryLock) return;
    this.#warnedMemoryLock = true;
    console.warn(`[@stamprally/core] ${message}`);
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
