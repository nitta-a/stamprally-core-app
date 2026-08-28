import type { RewardState, StampRallyState, StampRecord } from "../domain/index.js";

export interface StampStorage {
  load(rallyId: string, userId: string | null): Promise<StampRallyState | null>;
  save(state: StampRallyState): Promise<void>;
  remove(rallyId: string, userId: string | null): Promise<void>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StorageOperation = "open" | "load" | "save" | "remove";
export type StorageAdapterErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_OPEN_FAILED"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_REMOVE_FAILED"
  | "STORAGE_INVALID_DATA";

export class StorageAdapterError extends Error {
  readonly code: StorageAdapterErrorCode;
  readonly operation: StorageOperation;
  readonly rallyId: string | undefined;

  constructor(
    code: StorageAdapterErrorCode,
    operation: StorageOperation,
    message: string,
    options: { readonly cause?: unknown; readonly rallyId?: string } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageAdapterError";
    this.code = code;
    this.operation = operation;
    this.rallyId = options.rallyId;
  }
}

function cloneRecord(record: StampRecord): StampRecord {
  return record.metadata === undefined
    ? { ...record }
    : { ...record, metadata: { ...record.metadata } };
}

function cloneRewardState(state: RewardState): RewardState {
  return { ...state };
}

export function cloneState(state: StampRallyState): StampRallyState {
  return {
    ...state,
    records: state.records.map(cloneRecord),
    ...(state.rewards === undefined ? {} : { rewards: state.rewards.map(cloneRewardState) }),
  };
}

function isRecord(value: unknown): value is StampRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<StampRecord>;
  return (
    typeof record.stampId === "string" &&
    typeof record.acquiredAt === "string" &&
    (record.metadata === undefined ||
      (typeof record.metadata === "object" &&
        record.metadata !== null &&
        !Array.isArray(record.metadata)))
  );
}

const rewardStatuses = new Set(["LOCKED", "AVAILABLE", "CONSUMED", "EXPIRED"]);

function isOptionalDate(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

export function isRewardState(value: unknown): value is RewardState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<RewardState>;
  return (
    typeof state.rewardId === "string" &&
    typeof state.status === "string" &&
    rewardStatuses.has(state.status) &&
    isOptionalDate(state.unlockedAt) &&
    isOptionalDate(state.consumedAt) &&
    (state.consumedByStaffId === undefined || typeof state.consumedByStaffId === "string")
  );
}

export function isStampRallyState(value: unknown): value is StampRallyState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<StampRallyState>;
  return (
    typeof state.rallyId === "string" &&
    (typeof state.userId === "string" || state.userId === null) &&
    typeof state.updatedAt === "string" &&
    Array.isArray(state.records) &&
    state.records.every(isRecord) &&
    (state.rewards === undefined ||
      (Array.isArray(state.rewards) && state.rewards.every(isRewardState)))
  );
}

export interface RallySnapshot {
  readonly version: 1;
  readonly rallyId: string;
  readonly userId: string | null;
  readonly records: ReadonlyArray<StampRecord>;
  readonly rewards: ReadonlyArray<RewardState>;
  readonly exportedAt: string;
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSnapshotRecord(value: unknown): value is StampRecord {
  return isRecord(value) && isValidDate(value.acquiredAt);
}

function isRallySnapshot(value: unknown): value is RallySnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<RallySnapshot>;
  return (
    snapshot.version === 1 &&
    typeof snapshot.rallyId === "string" &&
    (typeof snapshot.userId === "string" || snapshot.userId === null) &&
    Array.isArray(snapshot.records) &&
    snapshot.records.every(isSnapshotRecord) &&
    Array.isArray(snapshot.rewards) &&
    snapshot.rewards.every(isRewardState) &&
    isValidDate(snapshot.exportedAt)
  );
}

export function exportProgressToken(snapshot: RallySnapshot): string {
  return globalThis.btoa(encodeURIComponent(JSON.stringify(snapshot)));
}

export function importProgressToken(token: string, currentRallyId: string): RallySnapshot | null {
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(globalThis.atob(token)));
    if (!isRallySnapshot(parsed) || parsed.rallyId !== currentRallyId) return null;
    return {
      ...parsed,
      records: parsed.records.map(cloneRecord),
      rewards: parsed.rewards.map(cloneRewardState),
    };
  } catch {
    return null;
  }
}

export class InMemoryStorage implements StampStorage {
  readonly #states = new Map<string, StampRallyState>();

  async load(rallyId: string, userId: string | null): Promise<StampRallyState | null> {
    const state = this.#states.get(storageKey(rallyId, userId));
    return state === undefined ? null : cloneState(state);
  }

  async save(state: StampRallyState): Promise<void> {
    this.#states.set(storageKey(state.rallyId, state.userId), cloneState(state));
  }

  async remove(rallyId: string, userId: string | null): Promise<void> {
    this.#states.delete(storageKey(rallyId, userId));
  }
}

export function storageKey(rallyId: string, userId: string | null): string {
  return `stamprally:${rallyId}:${userId ?? "anonymous"}`;
}

export interface LocalStorageAdapterOptions {
  readonly storage?: StorageLike | null;
  readonly keyPrefix?: string;
  readonly failureMode?: LocalStorageFailureMode;
  readonly onWarning?: StorageWarningHandler;
}

export type LocalStorageFailureMode = "fallback" | "throw";
export type StorageWarningHandler = (error: StorageAdapterError) => void;

const defaultStorageWarningHandler: StorageWarningHandler = (error) => {
  console.warn(`[@stamprally/core] ${error.message}`, error);
};

export class LocalStorageAdapter implements StampStorage {
  readonly #providedStorage: StorageLike | null | undefined;
  readonly #keyPrefix: string;
  readonly #failureMode: LocalStorageFailureMode;
  readonly #onWarning: StorageWarningHandler;
  readonly #fallbackStorage = new InMemoryStorage();
  #isFallbackActive = false;

  constructor(options: LocalStorageAdapterOptions = {}) {
    this.#providedStorage = options.storage;
    this.#keyPrefix = options.keyPrefix ?? "stamprally:";
    this.#failureMode = options.failureMode ?? "fallback";
    this.#onWarning = options.onWarning ?? defaultStorageWarningHandler;
  }

  async load(rallyId: string, userId: string | null): Promise<StampRallyState | null> {
    if (this.#isFallbackActive) return this.#fallbackStorage.load(rallyId, userId);

    try {
      const serialized = this.#getStorage("load", rallyId).getItem(this.#key(rallyId, userId));
      if (serialized === null) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(serialized);
      } catch (cause) {
        throw new StorageAdapterError(
          "STORAGE_INVALID_DATA",
          "load",
          `Stored rally '${rallyId}' is not valid JSON.`,
          { cause, rallyId },
        );
      }
      if (!isStampRallyState(parsed) || parsed.rallyId !== rallyId) {
        throw new StorageAdapterError(
          "STORAGE_INVALID_DATA",
          "load",
          `Stored rally '${rallyId}' has an invalid state shape.`,
          { rallyId },
        );
      }
      return cloneState(parsed);
    } catch (cause) {
      return this.#handleFailure(
        this.#normalizeError(
          cause,
          "STORAGE_READ_FAILED",
          "load",
          `Failed to read rally '${rallyId}' from localStorage.`,
          rallyId,
        ),
        () => this.#fallbackStorage.load(rallyId, userId),
      );
    }
  }

  async save(state: StampRallyState): Promise<void> {
    if (this.#isFallbackActive) return this.#fallbackStorage.save(state);

    try {
      this.#getStorage("save", state.rallyId).setItem(
        this.#key(state.rallyId, state.userId),
        JSON.stringify(state),
      );
    } catch (cause) {
      return this.#handleFailure(
        this.#normalizeError(
          cause,
          "STORAGE_WRITE_FAILED",
          "save",
          `Failed to save rally '${state.rallyId}' to localStorage.`,
          state.rallyId,
        ),
        () => this.#fallbackStorage.save(state),
      );
    }
  }

  async remove(rallyId: string, userId: string | null): Promise<void> {
    if (this.#isFallbackActive) return this.#fallbackStorage.remove(rallyId, userId);

    try {
      this.#getStorage("remove", rallyId).removeItem(this.#key(rallyId, userId));
    } catch (cause) {
      return this.#handleFailure(
        this.#normalizeError(
          cause,
          "STORAGE_REMOVE_FAILED",
          "remove",
          `Failed to remove rally '${rallyId}' from localStorage.`,
          rallyId,
        ),
        () => this.#fallbackStorage.remove(rallyId, userId),
      );
    }
  }

  #key(rallyId: string, userId: string | null): string {
    return `${this.#keyPrefix}${rallyId}:${userId ?? "anonymous"}`;
  }

  #getStorage(operation: StorageOperation, rallyId: string): StorageLike {
    if (this.#providedStorage === null) {
      throw new StorageAdapterError(
        "STORAGE_UNAVAILABLE",
        operation,
        "localStorage is unavailable in this environment.",
        { rallyId },
      );
    }
    if (this.#providedStorage !== undefined) return this.#providedStorage;
    if (typeof window === "undefined") {
      throw new StorageAdapterError(
        "STORAGE_UNAVAILABLE",
        operation,
        "localStorage is unavailable in this environment.",
        { rallyId },
      );
    }
    try {
      const storage = window.localStorage;
      if (storage !== undefined) return storage;
    } catch (cause) {
      throw new StorageAdapterError(
        "STORAGE_UNAVAILABLE",
        operation,
        "localStorage is unavailable in this environment.",
        { cause, rallyId },
      );
    }
    throw new StorageAdapterError(
      "STORAGE_UNAVAILABLE",
      operation,
      "localStorage is unavailable in this environment.",
      { rallyId },
    );
  }

  #normalizeError(
    cause: unknown,
    code: StorageAdapterErrorCode,
    operation: StorageOperation,
    message: string,
    rallyId: string,
  ): StorageAdapterError {
    return cause instanceof StorageAdapterError
      ? cause
      : new StorageAdapterError(code, operation, message, { cause, rallyId });
  }

  #handleFailure<T>(error: StorageAdapterError, fallback: () => Promise<T>): Promise<T> {
    if (this.#failureMode === "throw") throw error;
    this.#isFallbackActive = true;
    try {
      this.#onWarning(error);
    } catch {
      // Warning handlers must not prevent the safe in-memory fallback.
    }
    return fallback();
  }
}

export interface IndexedDBAdapterOptions {
  readonly indexedDB?: IDBFactory | null;
  readonly databaseName?: string;
}

const INDEXED_DB_STORE_NAME = "states";

export class IndexedDBAdapter implements StampStorage {
  readonly #providedFactory: IDBFactory | null | undefined;
  readonly #databaseName: string;
  #databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDBAdapterOptions = {}) {
    this.#providedFactory = options.indexedDB;
    this.#databaseName = options.databaseName ?? "stamprally";
  }

  async load(rallyId: string, userId: string | null): Promise<StampRallyState | null> {
    const database = await this.#openDatabase(rallyId);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(INDEXED_DB_STORE_NAME, "readonly");
        const request = transaction
          .objectStore(INDEXED_DB_STORE_NAME)
          .get(storageKey(rallyId, userId));
        request.onsuccess = () => {
          const value: unknown = request.result;
          if (value === undefined) {
            resolve(null);
            return;
          }
          if (!isStampRallyState(value) || value.rallyId !== rallyId) {
            reject(
              new StorageAdapterError(
                "STORAGE_INVALID_DATA",
                "load",
                `Stored rally '${rallyId}' has an invalid state shape.`,
                { rallyId },
              ),
            );
            return;
          }
          resolve(cloneState(value));
        };
        request.onerror = () => {
          reject(
            new StorageAdapterError(
              "STORAGE_READ_FAILED",
              "load",
              `Failed to read rally '${rallyId}' from IndexedDB.`,
              { cause: request.error, rallyId },
            ),
          );
        };
      } catch (cause) {
        reject(
          new StorageAdapterError(
            "STORAGE_READ_FAILED",
            "load",
            `Failed to read rally '${rallyId}' from IndexedDB.`,
            { cause, rallyId },
          ),
        );
      }
    });
  }

  async save(state: StampRallyState): Promise<void> {
    const database = await this.#openDatabase(state.rallyId);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(INDEXED_DB_STORE_NAME, "readwrite");
        transaction
          .objectStore(INDEXED_DB_STORE_NAME)
          .put(cloneState(state), storageKey(state.rallyId, state.userId));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          reject(
            new StorageAdapterError(
              "STORAGE_WRITE_FAILED",
              "save",
              `Failed to save rally '${state.rallyId}' to IndexedDB.`,
              { cause: transaction.error, rallyId: state.rallyId },
            ),
          );
        };
        transaction.onabort = transaction.onerror;
      } catch (cause) {
        reject(
          new StorageAdapterError(
            "STORAGE_WRITE_FAILED",
            "save",
            `Failed to save rally '${state.rallyId}' to IndexedDB.`,
            { cause, rallyId: state.rallyId },
          ),
        );
      }
    });
  }

  async remove(rallyId: string, userId: string | null): Promise<void> {
    const database = await this.#openDatabase(rallyId);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(INDEXED_DB_STORE_NAME, "readwrite");
        transaction.objectStore(INDEXED_DB_STORE_NAME).delete(storageKey(rallyId, userId));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          reject(
            new StorageAdapterError(
              "STORAGE_REMOVE_FAILED",
              "remove",
              `Failed to remove rally '${rallyId}' from IndexedDB.`,
              { cause: transaction.error, rallyId },
            ),
          );
        };
        transaction.onabort = transaction.onerror;
      } catch (cause) {
        reject(
          new StorageAdapterError(
            "STORAGE_REMOVE_FAILED",
            "remove",
            `Failed to remove rally '${rallyId}' from IndexedDB.`,
            { cause, rallyId },
          ),
        );
      }
    });
  }

  #getFactory(rallyId: string): IDBFactory {
    if (this.#providedFactory === null) {
      throw new StorageAdapterError(
        "STORAGE_UNAVAILABLE",
        "open",
        "IndexedDB is unavailable in this environment.",
        { rallyId },
      );
    }
    if (this.#providedFactory !== undefined) return this.#providedFactory;
    try {
      const factory = (globalThis as { readonly indexedDB?: IDBFactory }).indexedDB;
      if (factory !== undefined) return factory;
    } catch (cause) {
      throw new StorageAdapterError(
        "STORAGE_UNAVAILABLE",
        "open",
        "IndexedDB is unavailable in this environment.",
        { cause, rallyId },
      );
    }
    throw new StorageAdapterError(
      "STORAGE_UNAVAILABLE",
      "open",
      "IndexedDB is unavailable in this environment.",
      { rallyId },
    );
  }

  #openDatabase(rallyId: string): Promise<IDBDatabase> {
    if (this.#databasePromise !== null) return this.#databasePromise;
    const factory = this.#getFactory(rallyId);
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(this.#databaseName, 1);
      } catch (cause) {
        reject(
          new StorageAdapterError(
            "STORAGE_OPEN_FAILED",
            "open",
            `Failed to open IndexedDB database '${this.#databaseName}'.`,
            { cause, rallyId },
          ),
        );
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(INDEXED_DB_STORE_NAME)) {
          database.createObjectStore(INDEXED_DB_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        reject(
          new StorageAdapterError(
            "STORAGE_OPEN_FAILED",
            "open",
            `Failed to open IndexedDB database '${this.#databaseName}'.`,
            { cause: request.error, rallyId },
          ),
        );
      };
      request.onblocked = () => {
        reject(
          new StorageAdapterError(
            "STORAGE_OPEN_FAILED",
            "open",
            `Opening IndexedDB database '${this.#databaseName}' was blocked.`,
            { rallyId },
          ),
        );
      };
    });
    this.#databasePromise = opening.catch((error: unknown) => {
      this.#databasePromise = null;
      throw error;
    });
    return this.#databasePromise;
  }
}
