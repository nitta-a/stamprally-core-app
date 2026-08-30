import type {
  PublicRallyConfig,
  RewardState,
  StampRallyState,
  UserRallyState,
} from "../domain/index.js";
import { reconcileRewardStates } from "../engine/index.js";
import type { CheckInOptions, CheckInResult, ClaimOptions, ClaimResult } from "./client.js";
import { StampRallyClient } from "./client.js";
import type {
  OfflineStorageCapability,
  QueueCapabilitiesDetail,
  RejectedOperationHistoryEntry,
  SyncState,
} from "./offlineQueue.js";
import { InMemoryStorage } from "./storage.js";

export interface RallyAdapterSyncState {
  readonly isSyncing: boolean;
  readonly pendingCount: number;
  readonly rejectedHistory: ReadonlyArray<RejectedOperationHistoryEntry>;
  readonly storageCapability: OfflineStorageCapability;
  readonly isStoragePersistent: boolean;
  readonly queueCapabilities: QueueCapabilitiesDetail;
}

/** Minimal adapter contract shared by headless, React, and UI integrations. */
export interface RallyViewerAdapter<TLocale extends string = string> {
  readonly config: PublicRallyConfig<TLocale>;
  readonly onCheckIn: (
    spotId: string,
    proof: unknown,
    options?: CheckInOptions,
  ) => Promise<CheckInResult>;
  readonly onClaimReward?: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
  readonly state?: UserRallyState;
  readonly isLoading?: boolean;
  readonly error?: Error | null;
  readonly onSync?: () => Promise<void>;
  readonly syncState?: RallyAdapterSyncState & { readonly syncState?: SyncState };
  readonly subscribe?: (listener: (state: UserRallyState) => void) => () => void;
}

export interface MockRallyAdapter<TLocale extends string = string>
  extends RallyViewerAdapter<TLocale> {
  readonly state: UserRallyState;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly onClaimReward: (rewardId: string, options?: ClaimOptions) => Promise<ClaimResult>;
  readonly onSync: () => Promise<void>;
  readonly syncState: RallyAdapterSyncState & { readonly syncState: SyncState };
  readonly subscribe: (listener: (state: UserRallyState) => void) => () => void;
}

export interface MockRallyAdapterOptions {
  readonly initialStamps?: readonly string[];
  readonly initialRewards?: Readonly<Record<string, RewardState>>;
}

function initialState<TLocale extends string>(
  config: PublicRallyConfig<TLocale>,
  options: MockRallyAdapterOptions,
): StampRallyState {
  const now = "2026-01-01T00:00:00.000Z";
  const spotIds = new Set(config.spots.map((spot) => spot.id));
  const stampIds = [...new Set(options.initialStamps ?? [])].filter((id) => spotIds.has(id));
  const records = stampIds.map((stampId) => ({ stampId, acquiredAt: now }));
  const configuredRewards = reconcileRewardStates(config.rewards, [], records.length, now);
  const rewardOverrides = options.initialRewards ?? {};
  const rewards = configuredRewards.map((reward) => rewardOverrides[reward.rewardId] ?? reward);
  return { rallyId: config.id, userId: "mock-user", records, rewards, updatedAt: now };
}

/** Creates a deterministic in-memory adapter for demos, stories, and integration tests. */
export function createMockRallyAdapter<TLocale extends string = string>(
  config: PublicRallyConfig<TLocale>,
  options: MockRallyAdapterOptions = {},
): MockRallyAdapter<TLocale> {
  const storage = new InMemoryStorage();
  let currentState = initialState(config, options);
  void storage.save(currentState);
  const client = new StampRallyClient(config, {
    storage,
    userId: "mock-user",
    offlineQueue: false,
    clock: () => "2026-01-01T00:00:00.000Z",
  });
  const listeners = new Set<(state: UserRallyState) => void>();
  let error: Error | null = null;
  client.subscribe((state) => {
    currentState = state;
    for (const listener of listeners) listener(state);
  });
  void client.init();
  const notifyError = <T extends CheckInResult | ClaimResult>(result: T): T => {
    if (!result.ok)
      error = new Error("message" in result.error ? result.error.message : result.error.code);
    else error = null;
    return result;
  };
  const syncState: MockRallyAdapter<TLocale>["syncState"] = {
    syncState: "idle",
    isSyncing: false,
    pendingCount: 0,
    rejectedHistory: [],
    storageCapability: "disabled",
    isStoragePersistent: false,
    queueCapabilities: {
      storageType: "none",
      isPersistent: false,
      multiTabSync: "disabled_unsafe_environment",
    },
  };
  return {
    config,
    get state() {
      return currentState;
    },
    get isLoading() {
      return false;
    },
    get error() {
      return error;
    },
    onCheckIn: async (spotId, proof, checkInOptions) =>
      notifyError(await client.checkIn(spotId, proof, checkInOptions)),
    onClaimReward: async (rewardId, claimOptions) =>
      notifyError(await client.claimReward(rewardId, claimOptions)),
    onSync: async () => {
      await client.sync();
    },
    syncState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
