import type { RewardState, UserRallyState } from "../domain/index.js";

export interface MergeConflictOptions {
  readonly policy: "server_wins" | "merge";
}

function latestTimestamp(serverTimestamp: string, localTimestamp: string): string {
  const serverTime = Date.parse(serverTimestamp);
  const localTime = Date.parse(localTimestamp);
  if (!Number.isNaN(serverTime) && !Number.isNaN(localTime))
    return serverTime >= localTime ? serverTimestamp : localTimestamp;
  if (!Number.isNaN(serverTime)) return serverTimestamp;
  if (!Number.isNaN(localTime)) return localTimestamp;
  return serverTimestamp >= localTimestamp ? serverTimestamp : localTimestamp;
}

function mergeRewardStates(
  serverRewards: ReadonlyArray<RewardState>,
  localRewards: ReadonlyArray<RewardState>,
): ReadonlyArray<RewardState> {
  const merged = new Map(serverRewards.map((reward) => [reward.rewardId, reward]));
  for (const localReward of localRewards) {
    const serverReward = merged.get(localReward.rewardId);
    if (serverReward === undefined) {
      merged.set(localReward.rewardId, localReward);
      continue;
    }
    if (localReward.status === "CONSUMED" && serverReward.status !== "CONSUMED")
      merged.set(localReward.rewardId, localReward);
  }
  return [...merged.values()];
}

/** Resolves a server/local state conflict without mutating either input state. */
export function resolveRallyStateConflict(
  serverState: UserRallyState,
  localState: UserRallyState,
  options: MergeConflictOptions = { policy: "merge" },
): UserRallyState {
  if (options.policy === "server_wins") return serverState;
  const records = [...serverState.records];
  const knownStamps = new Set(records.map((record) => record.stampId));
  for (const record of localState.records) {
    if (!knownStamps.has(record.stampId)) {
      records.push(record);
      knownStamps.add(record.stampId);
    }
  }
  return {
    ...serverState,
    records,
    rewards: mergeRewardStates(serverState.rewards, localState.rewards),
    updatedAt: latestTimestamp(serverState.updatedAt, localState.updatedAt),
  };
}
