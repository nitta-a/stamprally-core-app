import type { RewardItem, RewardState } from "../domain/models.js";

export interface ClaimTicketOptions {
  readonly issuedAt?: string;
  readonly sequence?: number;
}

function hash(value: string): string {
  let result = 2_166_136_261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16_777_619) >>> 0;
  }
  return result.toString(36).toUpperCase().padStart(7, "0");
}

export function createClaimTicketNumber(
  rewardId: string,
  options: ClaimTicketOptions = {},
): string {
  const issuedAt = options.issuedAt ?? "";
  const sequence = options.sequence ?? 0;
  return `SR-${hash(`${rewardId}|${issuedAt}|${sequence}`)}`;
}

export function issueClaimTicketNumber(
  reward: RewardItem,
  currentState: RewardState,
  options: ClaimTicketOptions = {},
): RewardState {
  if (currentState.claimTicketNumber !== undefined) return currentState;
  const claimTicketNumber = reward.claimTicketNumber ?? createClaimTicketNumber(reward.id, options);
  return { ...currentState, claimTicketNumber };
}
