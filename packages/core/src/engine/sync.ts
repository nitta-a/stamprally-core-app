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
    const winner =
      localReward.status === "CONSUMED" && serverReward.status !== "CONSUMED"
        ? localReward
        : serverReward;
    merged.set(localReward.rewardId, {
      ...winner,
      ...(serverReward.unlockedAt === undefined && localReward.unlockedAt === undefined
        ? {}
        : {
            unlockedAt:
              serverReward.unlockedAt === undefined
                ? localReward.unlockedAt
                : localReward.unlockedAt === undefined
                  ? serverReward.unlockedAt
                  : latestTimestamp(serverReward.unlockedAt, localReward.unlockedAt),
          }),
      ...(serverReward.consumedAt === undefined && localReward.consumedAt === undefined
        ? {}
        : {
            consumedAt:
              serverReward.consumedAt === undefined
                ? localReward.consumedAt
                : localReward.consumedAt === undefined
                  ? serverReward.consumedAt
                  : latestTimestamp(serverReward.consumedAt, localReward.consumedAt),
          }),
      ...(serverReward.redeemedCount === undefined && localReward.redeemedCount === undefined
        ? {}
        : {
            redeemedCount: Math.max(
              serverReward.redeemedCount ?? 0,
              localReward.redeemedCount ?? 0,
            ),
          }),
      ...(serverReward.userRedemptionCount === undefined &&
      localReward.userRedemptionCount === undefined
        ? {}
        : {
            userRedemptionCount: Math.max(
              serverReward.userRedemptionCount ?? 0,
              localReward.userRedemptionCount ?? 0,
            ),
          }),
    });
  }
  return [...merged.values()];
}

function mergeStampRecords(
  serverRecords: ReadonlyArray<UserRallyState["records"][number]>,
  localRecords: ReadonlyArray<UserRallyState["records"][number]>,
): ReadonlyArray<UserRallyState["records"][number]> {
  const merged = new Map<string, UserRallyState["records"][number]>();
  for (const record of [...serverRecords, ...localRecords]) {
    const current = merged.get(record.stampId);
    if (current === undefined) {
      merged.set(record.stampId, record);
      continue;
    }
    const acquiredAt = latestTimestamp(current.acquiredAt, record.acquiredAt);
    merged.set(record.stampId, {
      ...current,
      ...(acquiredAt === current.acquiredAt ? {} : { acquiredAt }),
      ...(current.metadata === undefined && record.metadata !== undefined
        ? { metadata: record.metadata }
        : {}),
    });
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
  return {
    ...serverState,
    records: mergeStampRecords(serverState.records, localState.records),
    rewards: mergeRewardStates(serverState.rewards, localState.rewards),
    updatedAt: latestTimestamp(serverState.updatedAt, localState.updatedAt),
  };
}
