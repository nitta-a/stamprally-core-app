import type { StampCondition } from "./conditions.js";

export type SupportedLocale = "ja" | "en";
export type LocalizedString = Record<SupportedLocale, string>;
export type LocalizedText = string | LocalizedString;

export type SlotShape = "circle" | "square" | "rounded";

export interface SheetTheme {
  readonly primaryColor: string;
  readonly backgroundColor?: string;
  readonly backgroundImageUrl?: string;
  readonly cardBackgroundColor: string;
  readonly textColor: string;
  readonly slotShape: SlotShape;
  readonly gridColumns: number;
  readonly unclaimedOpacity?: number;
  readonly completedStampColor?: string;
}

export type ThemePresetId = "default" | "modern_dark" | "pop_candy" | "retro_craft" | "cyber";

export interface ThemePreset {
  readonly id: ThemePresetId;
  readonly name: LocalizedString;
  readonly description: LocalizedString;
  readonly theme: SheetTheme;
}

export const DEFAULT_SHEET_THEME: SheetTheme = {
  primaryColor: "#9e551e",
  backgroundColor: "#fbf4df",
  cardBackgroundColor: "#fffdf5",
  textColor: "#352f25",
  slotShape: "rounded",
  gridColumns: 3,
  unclaimedOpacity: 1,
};

export interface SpotItem {
  readonly id: string;
  readonly name: LocalizedText;
  readonly description?: LocalizedText;
  readonly hint?: LocalizedText;
  readonly condition: StampCondition;
  readonly order?: number;
}

/** @deprecated Use SpotItem instead. */
export type StampDefinition = SpotItem;

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
  readonly title: LocalizedText;
  readonly description: LocalizedText;
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
  readonly title?: LocalizedText;
  readonly description?: LocalizedText;
  readonly stamps: ReadonlyArray<StampDefinition>;
  readonly rewards?: ReadonlyArray<RewardItem>;
  readonly isSequential?: boolean;
  readonly theme?: SheetTheme;
}
