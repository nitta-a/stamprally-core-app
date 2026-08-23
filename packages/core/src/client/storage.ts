import type { StampRallyState, StampRecord } from "../domain/index.js";

export interface StampStorage {
  load(rallyId: string): Promise<StampRallyState | null>;
  save(state: StampRallyState): Promise<void>;
  remove(rallyId: string): Promise<void>;
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

export function cloneState(state: StampRallyState): StampRallyState {
  return {
    ...state,
    records: state.records.map(cloneRecord),
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

export function isStampRallyState(value: unknown): value is StampRallyState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<StampRallyState>;
  return (
    typeof state.rallyId === "string" &&
    typeof state.updatedAt === "string" &&
    Array.isArray(state.records) &&
    state.records.every(isRecord)
  );
}

export class InMemoryStorage implements StampStorage {
  readonly #states = new Map<string, StampRallyState>();

  async load(rallyId: string): Promise<StampRallyState | null> {
    const state = this.#states.get(rallyId);
    return state === undefined ? null : cloneState(state);
  }

  async save(state: StampRallyState): Promise<void> {
    this.#states.set(state.rallyId, cloneState(state));
  }

  async remove(rallyId: string): Promise<void> {
    this.#states.delete(rallyId);
  }
}

export interface LocalStorageAdapterOptions {
  readonly storage?: StorageLike | null;
  readonly keyPrefix?: string;
}

export class LocalStorageAdapter implements StampStorage {
  readonly #providedStorage: StorageLike | null | undefined;
  readonly #keyPrefix: string;

  constructor(options: LocalStorageAdapterOptions = {}) {
    this.#providedStorage = options.storage;
    this.#keyPrefix = options.keyPrefix ?? "stamprally:";
  }

  async load(rallyId: string): Promise<StampRallyState | null> {
    const storage = this.#getStorage("load", rallyId);
    let serialized: string | null;
    try {
      serialized = storage.getItem(this.#key(rallyId));
    } catch (cause) {
      throw new StorageAdapterError(
        "STORAGE_READ_FAILED",
        "load",
        `Failed to read rally '${rallyId}' from localStorage.`,
        { cause, rallyId },
      );
    }
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
  }

  async save(state: StampRallyState): Promise<void> {
    const storage = this.#getStorage("save", state.rallyId);
    try {
      storage.setItem(this.#key(state.rallyId), JSON.stringify(state));
    } catch (cause) {
      throw new StorageAdapterError(
        "STORAGE_WRITE_FAILED",
        "save",
        `Failed to save rally '${state.rallyId}' to localStorage.`,
        { cause, rallyId: state.rallyId },
      );
    }
  }

  async remove(rallyId: string): Promise<void> {
    const storage = this.#getStorage("remove", rallyId);
    try {
      storage.removeItem(this.#key(rallyId));
    } catch (cause) {
      throw new StorageAdapterError(
        "STORAGE_REMOVE_FAILED",
        "remove",
        `Failed to remove rally '${rallyId}' from localStorage.`,
        { cause, rallyId },
      );
    }
  }

  #key(rallyId: string): string {
    return `${this.#keyPrefix}${rallyId}`;
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
    try {
      const storage = (globalThis as { readonly localStorage?: StorageLike }).localStorage;
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

  async load(rallyId: string): Promise<StampRallyState | null> {
    const database = await this.#openDatabase(rallyId);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(INDEXED_DB_STORE_NAME, "readonly");
        const request = transaction.objectStore(INDEXED_DB_STORE_NAME).get(rallyId);
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
        transaction.objectStore(INDEXED_DB_STORE_NAME).put(cloneState(state), state.rallyId);
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

  async remove(rallyId: string): Promise<void> {
    const database = await this.#openDatabase(rallyId);
    return new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(INDEXED_DB_STORE_NAME, "readwrite");
        transaction.objectStore(INDEXED_DB_STORE_NAME).delete(rallyId);
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
