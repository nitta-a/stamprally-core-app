import {
  createAnonymousSessionId,
  InMemoryOfflineQueueStorage,
  InMemoryStorage,
  OfflineQueue,
  type OfflineQueueStorage,
  type PublicRallyConfig,
  StampRallyClient,
  type StampStorage,
  type SyncRetryOptions,
} from "@stamprally/core";
import { BASE_URL } from "./backend.js";
import { createHttpSyncAdapter, type HttpSyncAdapter } from "./httpSyncAdapter.js";
import type { TestNetwork } from "./network.js";

export interface TestDevice {
  readonly client: StampRallyClient;
  readonly adapter: HttpSyncAdapter;
  readonly offlineQueue: OfflineQueue;
  readonly storage: StampStorage;
  readonly queueStorage: OfflineQueueStorage;
  readonly anonymousSessionId: string;
}

export interface TestDeviceOptions {
  readonly publicConfig: PublicRallyConfig;
  readonly network: TestNetwork;
  /** Reuse the storages of a previous device to simulate a page reload. */
  readonly storage?: StampStorage;
  readonly queueStorage?: OfflineQueueStorage;
  readonly anonymousSessionId?: string;
  readonly userId?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly retryOptions?: SyncRetryOptions;
}

/** Creates a participant device: a real client wired to the server through the test network. */
export function createTestDevice(options: TestDeviceOptions): TestDevice {
  const {
    publicConfig,
    network,
    storage = new InMemoryStorage(),
    queueStorage = new InMemoryOfflineQueueStorage(),
    anonymousSessionId = createAnonymousSessionId(),
    userId,
    headers = {},
    retryOptions = { maxRetries: 0 },
  } = options;
  const adapter = createHttpSyncAdapter({
    baseUrl: BASE_URL,
    fetch: network.fetch,
    config: publicConfig,
    headers,
  });
  const offlineQueue = new OfflineQueue({ storage: queueStorage, retryOptions });
  const client = new StampRallyClient(publicConfig, {
    storage,
    syncAdapter: adapter,
    offlineQueue,
    anonymousSessionId,
    ...(userId === undefined ? {} : { userId }),
  });
  return { client, adapter, offlineQueue, storage, queueStorage, anonymousSessionId };
}
