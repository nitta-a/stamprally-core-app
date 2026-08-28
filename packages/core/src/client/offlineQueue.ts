import type { UserRallyState } from "../domain/index.js";
import { resolveRallyStateConflict } from "../engine/sync.js";
import type { CheckInRequest, CheckInResult, ClaimRequest, ClaimResult } from "./client.js";

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
) => Promise<OfflineResult | OfflineConflictResult>;
export interface OfflineSyncResultEvent {
  readonly operation: OfflineOperation;
  readonly result: OfflineResult | OfflineConflictResult;
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

/** Durable, sequential retry queue for operations created while disconnected. */
export class OfflineQueue {
  readonly #storage: OfflineQueueStorage;
  readonly #key: string;
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
    this.#key = options.key ?? "stamprally:offline-queue";
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

  setSyncResultListener(listener: OfflineSyncResultListener | undefined): void {
    this.#syncResultListener = listener;
  }

  async initialize(): Promise<void> {
    if (this.#loaded) return;
    this.#operations = [...(await this.#storage.load(this.#key))];
    this.#loaded = true;
  }

  setSender(sender: OfflineSender): void {
    this.#sender = sender;
  }

  async enqueue(operation: OfflineOperation): Promise<void> {
    await this.initialize();
    const id = operationId(operation);
    if (this.#operations.some((item) => operationId(item) === id)) return;
    this.#operations = [...this.#operations, operation];
    await this.#storage.save(this.#key, this.#operations);
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
    await this.#storage.save(this.#key, this.#operations);
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
        let result: OfflineResult | OfflineConflictResult;
        try {
          result = await sender(operation);
        } catch (cause) {
          throw cause instanceof Error ? cause : new Error(String(cause));
        }
        const state =
          "conflict" in result && result.conflict === true
            ? await this.resolveConflict(operation, result.localState, result.serverState)
            : "ok" in result && result.ok
              ? result.value.state
              : undefined;
        await this.#syncResultListener?.({
          operation,
          result,
          ...(state === undefined ? {} : { state }),
        });
        this.#operations = this.#operations.slice(1);
        await this.#storage.save(this.#key, this.#operations);
      }
      this.#state = "idle";
    } catch (cause) {
      this.#state = "error";
      this.#error = cause instanceof Error ? cause : new Error(String(cause));
      throw this.#error;
    }
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
