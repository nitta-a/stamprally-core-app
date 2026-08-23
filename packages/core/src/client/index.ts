export type { Clock, StampRallyListener } from "./client.js";
export { StampRallyClient } from "./client.js";
export type {
  IndexedDBAdapterOptions,
  LocalStorageAdapterOptions,
  LocalStorageFailureMode,
  StampStorage,
  StorageAdapterErrorCode,
  StorageLike,
  StorageOperation,
  StorageWarningHandler,
} from "./storage.js";
export {
  IndexedDBAdapter,
  InMemoryStorage,
  isStampRallyState,
  LocalStorageAdapter,
  StorageAdapterError,
} from "./storage.js";
