import type { UserRallyState } from "@stamprally/core";

export function stampIds(state: UserRallyState | null | undefined): ReadonlyArray<string> {
  return state?.records.map(({ stampId }) => stampId) ?? [];
}

export function rewardStatus(
  state: UserRallyState | null | undefined,
  rewardId: string,
): string | undefined {
  return state?.rewards.find((reward) => reward.rewardId === rewardId)?.status;
}
