import type { PublicReward, RallyInventoryState, Reward, RewardState } from "../domain/models.js";

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

function createRandomHash(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi !== undefined && typeof cryptoApi.getRandomValues === "function") {
    const values = new Uint32Array(2);
    cryptoApi.getRandomValues(values);
    return Array.from(values, (value) => value.toString(36).toUpperCase().padStart(7, "0")).join(
      "",
    );
  }

  return `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2).toUpperCase()}`;
}

export function createClaimTicketNumber(
  rewardId: string,
  options: ClaimTicketOptions = {},
): string {
  const issuedAt = options.issuedAt ?? "";
  const sequence = options.sequence ?? 0;
  return `SR-${hash(`${rewardId}|${issuedAt}|${sequence}`)}`;
}

/** Creates a one-time ticket for a successful reward consumption. */
export function createUniqueClaimTicketNumber(rewardId: string, issuedAt: string): string {
  const timestamp = Date.parse(issuedAt);
  const timestampPart = Number.isNaN(timestamp) ? Date.now() : timestamp;
  return `CLAIM-${rewardId}-${timestampPart}-${createRandomHash()}`;
}

export function issueClaimTicketNumber(
  reward: Reward,
  currentState: RewardState,
  options: ClaimTicketOptions = {},
): RewardState {
  if (currentState.claimTicketNumber !== undefined) return currentState;
  const claimTicketNumber = createClaimTicketNumber(reward.id, options);
  return { ...currentState, claimTicketNumber };
}
/** Estimates display availability; the server remains authoritative for redemption. */
export function getRewardAvailability(
  reward: PublicReward,
  state: RewardState | undefined,
  inventory?: RallyInventoryState,
): { readonly available: boolean; readonly remaining: number | undefined } {
  const remaining =
    inventory?.rewardRemaining?.[reward.id] ??
    (reward.stockLimit === undefined
      ? undefined
      : Math.max(0, reward.stockLimit - (state?.redeemedCount ?? 0)));
  return {
    available: state?.status === "AVAILABLE" && remaining !== 0 && inventory?.sharedRemaining !== 0,
    remaining,
  };
}
