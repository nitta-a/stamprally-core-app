export type { Clock, StampRallyListener } from "./client.js";
export { StampRallyClient } from "./client.js";
export type {
  IndexedDBAdapterOptions,
  LocalStorageAdapterOptions,
  StampStorage,
  StorageAdapterErrorCode,
  StorageLike,
  StorageOperation,
} from "./storage.js";
export {
  IndexedDBAdapter,
  InMemoryStorage,
  isStampRallyState,
  LocalStorageAdapter,
  StorageAdapterError,
} from "./storage.js";
