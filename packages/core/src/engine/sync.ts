import type { UserRallyState } from "../domain/index.js";

export type ConflictResolutionPolicy = "authoritative_replay";

/** Uses the server snapshot as the immutable replay baseline. */
export function resolveRallyStateConflict(
  serverState: UserRallyState,
  _localState: UserRallyState,
): UserRallyState {
  return {
    ...serverState,
    records: serverState.records.map((record) => ({
      ...record,
      ...(record.metadata === undefined ? {} : { metadata: { ...record.metadata } }),
    })),
    rewards: serverState.rewards.map((reward) => ({ ...reward })),
    ...(serverState.inventory === undefined
      ? {}
      : {
          inventory: {
            ...serverState.inventory,
            ...(serverState.inventory.rewardRemaining === undefined
              ? {}
              : { rewardRemaining: { ...serverState.inventory.rewardRemaining } }),
          },
        }),
  };
}
