import type { StampCondition } from "./conditions.js";

export interface StampDefinition {
  readonly id: string;
  readonly name: string;
  readonly condition: StampCondition;
  readonly order?: number;
}

export interface StampRecord {
  readonly stampId: string;
  readonly acquiredAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type RewardType = "digital" | "in_person";

export type RedemptionMethod = "manual_slide" | "staff_passcode" | "view_only";

export type RewardStatus = "LOCKED" | "AVAILABLE" | "CONSUMED" | "EXPIRED";

export interface RewardItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: RewardType;
  readonly redemptionMethod: RedemptionMethod;
  readonly requiredStampCount: number;
  readonly digitalContentUrl?: string;
  readonly staffPasscode?: string;
}

export interface RewardState {
  readonly rewardId: string;
  readonly status: RewardStatus;
  readonly unlockedAt?: string;
  readonly consumedAt?: string;
  readonly consumedByStaffId?: string;
}

export interface StampRallyState {
  readonly rallyId: string;
  readonly records: ReadonlyArray<StampRecord>;
  readonly rewards?: ReadonlyArray<RewardState>;
  readonly updatedAt: string;
}

export interface RallyConfig {
  readonly id: string;
  readonly stamps: ReadonlyArray<StampDefinition>;
  readonly rewards?: ReadonlyArray<RewardItem>;
  readonly isSequential?: boolean;
}
