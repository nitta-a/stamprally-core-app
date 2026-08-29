import type { AdminRallyConfig, PublicRallyConfig, UserRallyState } from "../domain/index.js";
import { reconcileRewardStates } from "../engine/transition.js";
import type { OfflineOperation } from "./offlineQueue.js";
import { cloneState } from "./storage.js";

export interface RebuildUserStateOptions {
  readonly baseline: UserRallyState;
  readonly operations: ReadonlyArray<OfflineOperation>;
  readonly config?: AdminRallyConfig | PublicRallyConfig;
}

export interface RebuildUserStateResult {
  readonly state: UserRallyState;
  readonly rejectedOperationIds: ReadonlyArray<string>;
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
  const identity = operation.request.userId ?? operation.request.anonymousSessionId ?? "anonymous";
  return `${operation.kind}:${operation.request.rallyId}:${identity}:${operation.request.idempotencyKey}`;
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
  const rejectedCheckIns = new Set(
    operations
      .filter(
        (operation) => operation.status === "REJECTED_PERMANENT" && operation.kind === "checkIn",
      )
      .map((operation) => (operation.kind === "checkIn" ? operation.request.spotId : undefined))
      .filter((spotId): spotId is string => spotId !== undefined),
  );
  for (const operation of operations) {
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
