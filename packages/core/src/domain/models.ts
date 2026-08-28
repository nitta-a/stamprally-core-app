import type { StampCondition } from "./conditions.js";
import type { ExternalReference, VerificationCondition } from "./universalModel.js";

export type SupportedLocale = "ja" | "en";
export type LocalizedString<TLocale extends string = SupportedLocale> = Record<TLocale, string>;
export type LocalizedText<TLocale extends string = string> =
  | string
  | Partial<Record<TLocale, string>>;
export type LocaleDictionary<TLocale extends string = string> = Readonly<
  Record<TLocale, Readonly<Record<string, string>>>
>;

export type SlotShape = "circle" | "square" | "rounded";
export type FontFamily = "system-ui" | "serif" | "rounded-sans" | "monospace" | "handwritten";

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
  readonly fontFamily?: FontFamily;
}

export type ThemePresetId = "default" | "modern_dark" | "pop_candy" | "retro_craft" | "cyber";

export interface ThemePreset<TLocale extends string = SupportedLocale> {
  readonly id: ThemePresetId;
  readonly name: LocalizedString<TLocale>;
  readonly description: LocalizedString<TLocale>;
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
  fontFamily: "serif",
};

/** @deprecated Use UniversalSpotItem from the universal model. */
export interface SpotItem<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly name: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly hint?: LocalizedText<TLocale>;
  readonly condition: StampCondition;
  readonly orderIndex?: number;
  readonly order?: number;
  readonly deckId?: string;
  readonly groupId?: string;
  readonly guideId?: string;
  readonly iconUrl?: string;
  readonly imageUrl?: string;
  readonly externalUrl?: string;
  readonly redirectUrlAfterClaim?: string;
  readonly metadata?: TMeta;
  /** Canonical universal-model conditions. Legacy `condition` remains for engine internals. */
  readonly conditions?: ReadonlyArray<VerificationCondition>;
  readonly externalReferences?: ReadonlyArray<ExternalReference>;
  readonly prerequisites?: ReadonlyArray<string>;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly requiresStampIds?: ReadonlyArray<string>;
}

/** @deprecated Use SpotItem instead. */
export type StampDefinition<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = SpotItem<TLocale, TMeta>;

export interface StampRecord {
  readonly stampId: string;
  readonly acquiredAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type RewardType = "digital" | "in_person";

export type RedemptionMethod = "manual_slide" | "staff_passcode" | "view_only" | "server_claim";

export type RewardUnlockCondition =
  | { readonly type: "stamp_count"; readonly count: number }
  | { readonly type: "stamps"; readonly stampIds: ReadonlyArray<string> }
  | { readonly type: "group_complete"; readonly groupId: string }
  | {
      readonly type: "all" | "any";
      readonly conditions: ReadonlyArray<RewardUnlockCondition>;
    };

export type RewardStatus = "LOCKED" | "AVAILABLE" | "CONSUMED" | "EXPIRED";

export interface RewardItem<TLocale extends string = SupportedLocale> {
  readonly id: string;
  readonly title: LocalizedText<TLocale>;
  readonly description: LocalizedText<TLocale>;
  readonly type: RewardType;
  readonly redemptionMethod: RedemptionMethod;
  readonly requiredStampCount: number;
  readonly conditions?: ReadonlyArray<RewardUnlockCondition>;
  readonly digitalContentUrl?: string;
  readonly staffPasscode?: string;
  readonly validUntil?: string;
  readonly stockLimit?: number;
  readonly userClaimLimit?: number;
  readonly maxStock?: number;
  readonly limitPerUser?: number;
  readonly claimTicketNumber?: string;
}

export interface RewardState {
  readonly rewardId: string;
  readonly status: RewardStatus;
  readonly unlockedAt?: string;
  readonly consumedAt?: string;
  readonly consumedByStaffId?: string;
  readonly claimTicketNumber?: string;
  readonly redeemedCount?: number;
  readonly userRedemptionCount?: number;
}

export interface StampRallyState {
  readonly rallyId: string;
  readonly records: ReadonlyArray<StampRecord>;
  readonly rewards?: ReadonlyArray<RewardState>;
  readonly updatedAt: string;
}

/** @deprecated Use AdminRallyConfig or PublicRallyConfig from the universal model. */
export interface RallyConfig<
  TLocale extends string = SupportedLocale,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly title?: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly stamps: ReadonlyArray<StampDefinition<TLocale, TMeta>>;
  readonly rewards?: ReadonlyArray<RewardItem<TLocale>>;
  readonly isSequential?: boolean;
  readonly theme?: SheetTheme;
  readonly version?: number;
  readonly startDate?: string;
  readonly endDate?: string;
}
