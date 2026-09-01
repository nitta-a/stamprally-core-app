import type { AdminRallyConfig, PublicRallyConfig, UserRallyState } from "../domain/index.js";
import { reconcileRewardStates, sortOperationsDeterministically } from "../engine/transition.js";
import { type OfflineOperation, offlineOperationId } from "./offlineQueue.js";
import { cloneState } from "./storage.js";

export type SyncOperationAction = "CHECK_IN" | "CLAIM_REWARD";

export type AccountAuthProvider = "google" | "oidc" | "custom";

export type AnonymousProgressMergePolicy = "union" | "authoritative_replay";

export interface LinkAccountRequest {
  readonly authProviderToken: string;
  readonly provider: AccountAuthProvider;
  readonly rallyId: string;
  readonly anonymousSessionId: string;
  readonly anonymousState: UserRallyState;
  readonly operations: ReadonlyArray<OfflineOperation>;
}

export interface LinkAccountResponse {
  readonly userId: string;
  readonly authenticatedState?: UserRallyState;
  readonly mergePolicy?: AnonymousProgressMergePolicy;
}

export interface CloudSnapshotRequest {
  readonly rallyId: string;
  readonly userId: string;
  readonly state: UserRallyState;
}

export interface CloudSnapshotImportRequest {
  readonly rallyId: string;
  readonly userId: string;
  readonly snapshot: string;
}

/** Host-owned transport for provider-specific account linking and signed snapshots. */
export interface CloudSyncAdapter {
  readonly linkAccount: (request: LinkAccountRequest) => Promise<LinkAccountResponse>;
  readonly exportCloudSnapshot: (request: CloudSnapshotRequest) => Promise<string>;
  readonly importCloudSnapshot: (request: CloudSnapshotImportRequest) => Promise<UserRallyState>;
}

export type SyncOperationResult =
  | {
      readonly operationId: string;
      readonly status: "ACCEPTED";
      readonly resourceId: string;
      readonly action: SyncOperationAction;
      readonly appliedAt: number;
    }
  | {
      readonly operationId: string;
      readonly status: "REJECTED_PERMANENT";
      readonly resourceId: string;
      readonly errorCode: string;
      readonly reason: string;
    }
  | {
      readonly operationId: string;
      readonly status: "FAILED_RETRYABLE";
      readonly resourceId: string;
      readonly error: string;
    };

export interface SyncProgressResponse {
  readonly results: ReadonlyArray<SyncOperationResult>;
  readonly currentState: UserRallyState;
  readonly syncTimestamp: number;
}

export interface RebuildUserStateOptions {
  readonly baseline: UserRallyState;
  readonly operations: ReadonlyArray<OfflineOperation>;
  readonly config?: AdminRallyConfig | PublicRallyConfig;
}

export interface RebuildUserStateResult {
  readonly state: UserRallyState;
  readonly rejectedOperationIds: ReadonlyArray<string>;
}

export interface MigrateAnonymousProgressOptions {
  readonly anonymousState: UserRallyState;
  readonly authenticatedState?: UserRallyState | null;
  readonly userId: string;
  readonly policy?: AnonymousProgressMergePolicy;
}

function rewardRank(status: UserRallyState["rewards"][number]["status"]): number {
  return { LOCKED: 0, AVAILABLE: 1, EXPIRED: 1, CONSUMED: 2 }[status];
}

function mergeRewardStates(
  anonymous: ReadonlyArray<UserRallyState["rewards"][number]>,
  authenticated: ReadonlyArray<UserRallyState["rewards"][number]>,
  policy: AnonymousProgressMergePolicy,
): UserRallyState["rewards"] {
  const merged = new Map(authenticated.map((reward) => [reward.rewardId, { ...reward }]));
  for (const reward of anonymous) {
    const existing = merged.get(reward.rewardId);
    if (existing === undefined) {
      merged.set(reward.rewardId, { ...reward });
      continue;
    }
    if (policy === "authoritative_replay") continue;
    if (rewardRank(reward.status) > rewardRank(existing.status))
      merged.set(reward.rewardId, { ...reward });
  }
  return [...merged.values()];
}

/** Merges anonymous progress into an authenticated account without mutating either input. */
export function migrateAnonymousProgress(
  anonymousState: UserRallyState,
  authenticatedState: UserRallyState | null | undefined,
  userId: string,
  policy?: AnonymousProgressMergePolicy,
): UserRallyState;
export function migrateAnonymousProgress(options: MigrateAnonymousProgressOptions): UserRallyState;
export function migrateAnonymousProgress(
  anonymousOrOptions: UserRallyState | MigrateAnonymousProgressOptions,
  authenticatedArgument?: UserRallyState | null,
  userIdArgument?: string,
  policyArgument: AnonymousProgressMergePolicy = "union",
): UserRallyState {
  const isOptions = "anonymousState" in anonymousOrOptions;
  const anonymousState = isOptions ? anonymousOrOptions.anonymousState : anonymousOrOptions;
  const authenticatedState = isOptions
    ? anonymousOrOptions.authenticatedState
    : authenticatedArgument;
  const userId = isOptions ? anonymousOrOptions.userId : userIdArgument;
  const policy = isOptions ? (anonymousOrOptions.policy ?? "union") : policyArgument;
  if (userId === undefined || userId.trim() === "") throw new Error("A userId is required.");
  if (
    authenticatedState !== undefined &&
    authenticatedState !== null &&
    anonymousState.rallyId !== authenticatedState.rallyId
  )
    throw new Error("Progress belongs to another rally.");
  const records = new Map(
    (authenticatedState?.records ?? []).map((record) => [record.stampId, { ...record }]),
  );
  for (const record of anonymousState.records) {
    if (!records.has(record.stampId)) records.set(record.stampId, { ...record });
  }
  const base = authenticatedState ?? anonymousState;
  return {
    ...cloneState(base),
    userId,
    records: [...records.values()],
    rewards: mergeRewardStates(anonymousState.rewards, authenticatedState?.rewards ?? [], policy),
    updatedAt:
      anonymousState.updatedAt > base.updatedAt ? anonymousState.updatedAt : base.updatedAt,
  };
}

function isReplayable(operation: OfflineOperation): boolean {
  return (
    operation.status === undefined ||
    operation.status === "ACCEPTED" ||
    operation.status === "PENDING" ||
    operation.status === "IN_FLIGHT" ||
    operation.status === "FAILED_RETRYABLE"
  );
}

function operationId(operation: OfflineOperation): string {
  return offlineOperationId(operation);
}

function operationTimestamp(operation: OfflineOperation): number {
  const parsed = Date.parse(operation.request.now);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function applyInventoryDelta(
  state: UserRallyState,
  previous: UserRallyState,
  optimistic: UserRallyState,
): UserRallyState {
  const previousInventory = previous.inventory;
  const optimisticInventory = optimistic.inventory;
  if (previousInventory === undefined || optimisticInventory === undefined) return state;
  const currentInventory = state.inventory ?? {};
  const sharedDelta =
    previousInventory.sharedRemaining === undefined ||
    optimisticInventory.sharedRemaining === undefined
      ? undefined
      : optimisticInventory.sharedRemaining - previousInventory.sharedRemaining;
  const previousRewards = previousInventory.rewardRemaining ?? {};
  const optimisticRewards = optimisticInventory.rewardRemaining ?? {};
  const currentRewards = currentInventory.rewardRemaining ?? {};
  const rewardRemaining: Record<string, number> = { ...currentRewards };
  for (const key of new Set([...Object.keys(previousRewards), ...Object.keys(optimisticRewards)])) {
    const before = previousRewards[key];
    const after = optimisticRewards[key];
    if (before !== undefined && after !== undefined)
      rewardRemaining[key] = Math.max(0, (currentRewards[key] ?? before) + after - before);
  }
  const nextInventory: {
    readonly sharedRemaining?: number;
    readonly rewardRemaining?: Readonly<Record<string, number>>;
  } = {
    ...(currentInventory.sharedRemaining === undefined || sharedDelta === undefined
      ? optimisticInventory.sharedRemaining === undefined || sharedDelta === undefined
        ? {}
        : { sharedRemaining: Math.max(0, optimisticInventory.sharedRemaining) }
      : { sharedRemaining: Math.max(0, currentInventory.sharedRemaining + sharedDelta) }),
    ...(Object.keys(rewardRemaining).length === 0 ? {} : { rewardRemaining }),
  };
  return { ...state, inventory: nextInventory };
}

function applyOperation(
  state: UserRallyState,
  operation: OfflineOperation,
  config: AdminRallyConfig | PublicRallyConfig | undefined,
  rejectedCheckIns: ReadonlySet<string>,
): { readonly state: UserRallyState; readonly prerequisiteFailed: boolean } {
  if (operation.kind === "checkIn") {
    const spot = config?.spots.find((candidate) => candidate.id === operation.request.spotId);
    if (
      spot?.prerequisites?.some(
        (id) => rejectedCheckIns.has(id) || !state.records.some((record) => record.stampId === id),
      )
    )
      return { state, prerequisiteFailed: true };
    if (state.records.some((record) => record.stampId === operation.request.spotId))
      return { state, prerequisiteFailed: false };
    const optimisticRecord = operation.optimisticState?.records.find(
      (record) => record.stampId === operation.request.spotId,
    );
    const record = optimisticRecord ?? {
      stampId: operation.request.spotId,
      acquiredAt: operation.request.now,
    };
    const records = [...state.records, { ...record }];
    const rewards =
      config === undefined
        ? state.rewards
        : reconcileRewardStates(config.rewards, state.rewards, records.length, record.acquiredAt);
    return {
      state: { ...state, records, rewards, updatedAt: record.acquiredAt },
      prerequisiteFailed: false,
    };
  }

  const optimisticState = operation.optimisticState;
  if (optimisticState === undefined) return { state, prerequisiteFailed: false };
  const optimisticReward = optimisticState?.rewards.find(
    (reward) => reward.rewardId === operation.request.rewardId,
  );
  if (optimisticReward === undefined) return { state, prerequisiteFailed: false };
  const rewards = state.rewards.some((reward) => reward.rewardId === optimisticReward.rewardId)
    ? state.rewards.map((reward) =>
        reward.rewardId === optimisticReward.rewardId ? { ...optimisticReward } : reward,
      )
    : [...state.rewards, { ...optimisticReward }];
  return {
    state: applyInventoryDelta(
      { ...state, rewards, updatedAt: optimisticReward.consumedAt ?? state.updatedAt },
      operation.request.state,
      optimisticState,
    ),
    prerequisiteFailed: false,
  };
}

/** Replays the durable operation log on top of a server-confirmed baseline. */
export function rebuildUserStateFromLog(
  baseline: UserRallyState,
  operations: ReadonlyArray<OfflineOperation>,
  config?: AdminRallyConfig | PublicRallyConfig,
): UserRallyState;
export function rebuildUserStateFromLog(options: RebuildUserStateOptions): UserRallyState;
export function rebuildUserStateFromLog(
  baselineOrOptions: UserRallyState | RebuildUserStateOptions,
  operationsArgument?: ReadonlyArray<OfflineOperation>,
  configArgument?: AdminRallyConfig | PublicRallyConfig,
): UserRallyState {
  const { state } = rebuildUserStateLog(
    "baseline" in baselineOrOptions ? baselineOrOptions.baseline : baselineOrOptions,
    "baseline" in baselineOrOptions ? baselineOrOptions.operations : (operationsArgument ?? []),
    "baseline" in baselineOrOptions ? baselineOrOptions.config : configArgument,
  );
  return state;
}

export function rebuildUserStateLog(
  baseline: UserRallyState,
  operations: ReadonlyArray<OfflineOperation>,
  config?: AdminRallyConfig | PublicRallyConfig,
): RebuildUserStateResult {
  let state = cloneState(baseline);
  const rejectedOperationIds: string[] = [];
  const sortedOperations = sortOperationsDeterministically(
    operations.map((operation) => ({
      operation,
      operationId: offlineOperationId(operation),
      timestamp: operationTimestamp(operation),
    })),
  ).map(({ operation }) => operation);
  const rejectedCheckIns = new Set(
    sortedOperations
      .filter(
        (operation) => operation.status === "REJECTED_PERMANENT" && operation.kind === "checkIn",
      )
      .map((operation) => (operation.kind === "checkIn" ? operation.request.spotId : undefined))
      .filter((spotId): spotId is string => spotId !== undefined),
  );
  for (const operation of sortedOperations) {
    if (operation.status === "REJECTED_PERMANENT") {
      if (operation.kind === "checkIn") rejectedCheckIns.add(operation.request.spotId);
      continue;
    }
    if (!isReplayable(operation)) continue;
    const replay = applyOperation(state, operation, config, rejectedCheckIns);
    if (replay.prerequisiteFailed) {
      rejectedOperationIds.push(operationId(operation));
      if (operation.kind === "checkIn") rejectedCheckIns.add(operation.request.spotId);
      continue;
    }
    state = replay.state;
  }
  return { state, rejectedOperationIds };
}
