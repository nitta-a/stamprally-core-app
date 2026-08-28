import type { UserRallyState } from "../domain/index.js";
import { resolveRallyStateConflict } from "../engine/sync.js";
import type {
  CheckInRequest,
  CheckInResult,
  ClaimRequest,
  ClaimResult,
  ClientError,
} from "./client.js";

export type OfflineOperation =
  | { readonly kind: "checkIn"; readonly request: CheckInRequest }
  | { readonly kind: "claimReward"; readonly request: ClaimRequest };
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
}

export interface OfflineConflict {
  readonly operation: OfflineOperation;
  readonly localState: UserRallyState;
  readonly serverState: UserRallyState;
}

export type OfflineSender = (
  operation: OfflineOperation,
) => Promise<OfflineResult | OfflineConflictResult | OfflineOperationResponse>;
export type OfflineOperationStatus = "ACCEPTED" | "REJECTED_PERMANENT" | "RETRYABLE_ERROR";
export interface OfflineOperationError {
  readonly code: string;
  readonly message: string;
  readonly [key: string]: unknown;
}
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
  async load(key: string): Promise<ReadonlyArray<OfflineOperation>> {
    return this.#values.get(key) ?? [];
  }
  async save(key: string, operations: ReadonlyArray<OfflineOperation>): Promise<void> {
    this.#values.set(key, structuredClone(operations));
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

function defaultStorage(databaseName?: string): OfflineQueueStorage {
  try {
    const indexedDB = (globalThis as { readonly indexedDB?: IDBFactory }).indexedDB;
    if (indexedDB !== undefined)
      return new IndexedDBOfflineQueueStorage({
        indexedDB,
        ...(databaseName === undefined ? {} : { databaseName }),
      });
    const storage = (globalThis as { readonly localStorage?: OfflineQueueOptions["storageLike"] })
      .localStorage;
    if (storage !== undefined && storage !== null) return new LocalStorageQueueStorage(storage);
  } catch {
    // Access to localStorage can be denied by privacy mode or a sandbox.
  }
  return new MemoryQueueStorage();
}

function operationId(operation: OfflineOperation): string {
  return operation.kind === "checkIn"
    ? `checkIn:${operation.request.rallyId}:${operation.request.userId ?? "anonymous"}:${operation.request.idempotencyKey}`
    : `claimReward:${operation.request.rallyId}:${operation.request.userId ?? "anonymous"}:${operation.request.idempotencyKey}`;
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

/** Durable, sequential retry queue for operations created while disconnected. */
export class OfflineQueue {
  readonly #storage: OfflineQueueStorage;
  readonly #configuredKey: string | undefined;
  #rallyId: string | undefined;
  #userId: string | null;
  readonly #conflictPolicy: SyncConflictPolicy;
  readonly #onSyncConflict: OfflineQueueOptions["onSyncConflict"];
  #operations: OfflineOperation[] = [];
  #loaded = false;
  #state: SyncState = "idle";
  #error: Error | null = null;
  #sender: OfflineSender | undefined;
  #syncPromise: Promise<void> | null = null;
  #syncResultListener: OfflineSyncResultListener | undefined;

  constructor(options: OfflineQueueOptions = {}) {
    if (options.storage !== undefined) this.#storage = options.storage;
    else if (options.storageLike !== undefined && options.storageLike !== null)
      this.#storage = new LocalStorageQueueStorage(options.storageLike);
    else this.#storage = defaultStorage(options.databaseName);
    this.#configuredKey = options.key;
    this.#rallyId = options.rallyId;
    this.#userId = options.userId ?? null;
    this.#conflictPolicy = options.conflictPolicy ?? "server_wins";
    this.#onSyncConflict = options.onSyncConflict;
  }

  get syncState(): SyncState {
    return this.#state;
  }
  get pendingCount(): number {
    return this.#operations.length;
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
    this.#operations = [...(await this.#storage.load(this.#storageKey()))];
    this.#loaded = true;
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
    const id = operationId(operation);
    if (this.#operations.some((item) => operationId(item) === id)) return;
    this.#operations = [...this.#operations, operation];
    await this.#storage.save(this.#storageKey(), this.#operations);
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
    this.#state = "syncing";
    this.#error = null;
    try {
      while (this.#operations.length > 0) {
        const operation = this.#operations[0];
        if (operation === undefined) break;
        let rawResult: OfflineResult | OfflineConflictResult | OfflineOperationResponse;
        try {
          rawResult = await sender(operation);
        } catch (cause) {
          throw new Error(errorValue(cause, "RETRYABLE_ERROR").message);
        }
        const response = this.#normalizeResponse(rawResult);
        if (response.status === "RETRYABLE_ERROR") {
          const error = errorValue(response.error ?? response.reason, "RETRYABLE_ERROR");
          await this.#syncResultListener?.({ operation, status: response.status, error });
          throw new Error(error.message);
        }
        const result = response.result;
        const state =
          response.state ??
          (result !== undefined && "conflict" in result && result.conflict === true
            ? await this.resolveConflict(operation, result.localState, result.serverState)
            : result !== undefined && "ok" in result && result.ok
              ? result.value.state
              : undefined);
        const error =
          response.status === "REJECTED_PERMANENT"
            ? errorValue(response.error ?? response.reason, "REJECTED_PERMANENT")
            : undefined;
        this.#operations = this.#operations.slice(1);
        await this.#storage.save(this.#storageKey(), this.#operations);
        await this.#syncResultListener?.({
          operation,
          ...(result === undefined ? {} : { result }),
          status: response.status,
          ...(error === undefined ? {} : { error }),
          ...(state === undefined ? {} : { state }),
        });
      }
      this.#state = "idle";
    } catch (cause) {
      this.#state = "error";
      this.#error = cause instanceof Error ? cause : new Error(String(cause));
      throw this.#error;
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
}

export { MemoryQueueStorage as InMemoryOfflineQueueStorage };
