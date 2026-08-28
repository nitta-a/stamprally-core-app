export type SupportedLocale = "ja" | "en";
export type LocalizedText<TLocale extends string = string> =
  | string
  | Partial<Record<TLocale, string>>;
export type LocalizedString<TLocale extends string = SupportedLocale> = Record<TLocale, string>;
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

export interface ExternalReference {
  readonly type: string;
  readonly id: string;
  readonly url?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CheckInCondition =
  | { readonly type: "qr"; readonly secretToken: string; readonly qrEntryUrl?: string }
  | { readonly type: "passcode"; readonly code: string; readonly caseSensitive?: boolean }
  | {
      readonly type: "gps";
      readonly latitude: number;
      readonly longitude: number;
      readonly radiusMeters: number;
    }
  | { readonly type: "nfc"; readonly tagId: string }
  | {
      readonly type: "custom";
      readonly validatorName: string;
      readonly secretParams?: Readonly<Record<string, unknown>>;
    };

export type PublicCheckInCondition =
  | { readonly type: "qr"; readonly qrEntryUrl?: string }
  | { readonly type: "passcode" }
  | {
      readonly type: "gps";
      readonly latitude: number;
      readonly longitude: number;
      readonly radiusMeters: number;
    }
  | { readonly type: "nfc" }
  | { readonly type: "custom"; readonly validatorName: string };

export interface SpotItem<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly orderIndex: number;
  readonly name: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly hint?: LocalizedText<TLocale>;
  readonly imageUrl?: string;
  readonly iconUrl?: string;
  readonly redirectUrlAfterClaim?: string;
  readonly externalReferences?: ReadonlyArray<ExternalReference>;
  readonly metadata?: TMeta;
  readonly conditions: ReadonlyArray<CheckInCondition>;
  readonly prerequisites?: ReadonlyArray<string>;
}
export type PublicSpotItem<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = Omit<SpotItem<TLocale, TMeta>, "conditions"> & {
  readonly conditions: ReadonlyArray<PublicCheckInCondition>;
};

export type RewardUnlockCondition =
  | { readonly type: "stamp_count"; readonly count: number }
  | { readonly type: "stamps"; readonly stampIds: ReadonlyArray<string> }
  | { readonly type: "all" | "any"; readonly conditions: ReadonlyArray<RewardUnlockCondition> };
export type RewardType = "digital" | "in_person";
export type RedemptionMethod = "manual_slide" | "staff_passcode" | "view_only" | "server_claim";
export type InventoryAggregationMode = "shared" | "per_reward";
export type RallyInventory = Readonly<Record<string, number>> & {
  readonly sharedStock?: number;
};
export interface RallyInventoryState {
  readonly sharedRemaining?: number;
  readonly rewardRemaining?: Readonly<Record<string, number>>;
}
export interface Reward<TLocale extends string = string> {
  readonly id: string;
  readonly title: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly type: RewardType;
  readonly redemptionMethod: RedemptionMethod;
  readonly requiredStampCount: number;
  readonly conditions?: ReadonlyArray<RewardUnlockCondition>;
  readonly digitalContentUrl?: string;
  readonly staffPasscode?: string;
  readonly validUntil?: string;
  readonly stockLimit?: number;
  readonly userClaimLimit?: number;
}
export type PublicReward<TLocale extends string = string> = Omit<
  Reward<TLocale>,
  "digitalContentUrl" | "staffPasscode"
>;

export interface AdminRallyConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly version: string;
  readonly title: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly theme?: SheetTheme;
  readonly spots: ReadonlyArray<SpotItem<TLocale, TMeta>>;
  readonly rewards: ReadonlyArray<Reward<TLocale>>;
  readonly staffPasscode?: string;
  readonly inventory?: RallyInventory;
  /** How the optional top-level inventory limit is aggregated. */
  readonly inventoryMode?: InventoryAggregationMode;
  readonly serverMetadata?: Readonly<Record<string, unknown>>;
  readonly metadata?: TMeta;
  /** Explicit public metadata name. `metadata` remains supported for compatibility. */
  readonly publicMetadata?: TMeta;
  readonly serverEndpoint?: string;
}
export interface PublicRallyConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly version: string;
  readonly title: LocalizedText<TLocale>;
  readonly description?: LocalizedText<TLocale>;
  readonly theme?: SheetTheme;
  readonly spots: ReadonlyArray<PublicSpotItem<TLocale, TMeta>>;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly metadata?: TMeta;
  readonly serverEndpoint?: string;
}
export type RallyConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = PublicRallyConfig<TLocale, TMeta>;

function publicCondition(condition: CheckInCondition): PublicCheckInCondition {
  switch (condition.type) {
    case "qr":
      return condition.qrEntryUrl === undefined
        ? { type: "qr" }
        : { type: "qr", qrEntryUrl: condition.qrEntryUrl };
    case "passcode":
      return { type: "passcode" };
    case "gps":
      return {
        type: "gps",
        latitude: condition.latitude,
        longitude: condition.longitude,
        radiusMeters: condition.radiusMeters,
      };
    case "nfc":
      return { type: "nfc" };
    case "custom":
      return { type: "custom", validatorName: condition.validatorName };
  }
}
export function toPublicConfig<TLocale extends string, TMeta extends Record<string, unknown>>(
  config: AdminRallyConfig<TLocale, TMeta>,
): PublicRallyConfig<TLocale, TMeta> {
  return {
    id: config.id,
    version: config.version,
    title: config.title,
    ...(config.description === undefined ? {} : { description: config.description }),
    ...(config.theme === undefined ? {} : { theme: config.theme }),
    spots: config.spots.map((spot) => ({
      ...spot,
      conditions: spot.conditions.map(publicCondition),
    })),
    rewards: config.rewards.map(
      ({ digitalContentUrl: _content, staffPasscode: _passcode, ...reward }) => reward,
    ),
    ...(config.publicMetadata !== undefined
      ? { metadata: config.publicMetadata }
      : config.metadata === undefined
        ? {}
        : { metadata: config.metadata }),
    ...(config.serverEndpoint === undefined ? {} : { serverEndpoint: config.serverEndpoint }),
  };
}
export function assertPublicConfig(config: unknown): asserts config is PublicRallyConfig {
  if (!isPublicConfig(config)) throw new Error("Configuration contains private rally fields.");
}
export function isPublicConfig(value: unknown): value is PublicRallyConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const seen = new Set<object>();
  const containsPrivateField = (item: unknown): boolean => {
    if (typeof item !== "object" || item === null) return false;
    if (seen.has(item)) return false;
    seen.add(item);
    if (Array.isArray(item)) return item.some(containsPrivateField);
    const record = item as Record<string, unknown>;
    if (
      ["staffPasscode", "secretToken", "serverMetadata", "secretParams", "digitalContentUrl"].some(
        (key) => key in record,
      )
    )
      return true;
    return Object.values(record).some(containsPrivateField);
  };
  if (containsPrivateField(candidate)) return false;
  for (const key of [
    "staffPasscode",
    "secretToken",
    "serverMetadata",
    "secretParams",
    "code",
    "tagId",
  ]) {
    if (key in candidate) return false;
  }
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.version !== "string" ||
    (typeof candidate.title !== "string" &&
      (typeof candidate.title !== "object" ||
        candidate.title === null ||
        Array.isArray(candidate.title))) ||
    !Array.isArray(candidate.spots) ||
    !Array.isArray(candidate.rewards)
  )
    return false;
  return (
    candidate.spots.every((spot) => {
      if (typeof spot !== "object" || spot === null || Array.isArray(spot)) return false;
      const item = spot as Record<string, unknown>;
      if (
        typeof item.id !== "string" ||
        typeof item.orderIndex !== "number" ||
        item.name === undefined ||
        "secretToken" in item ||
        "code" in item ||
        "tagId" in item ||
        "secretParams" in item
      )
        return false;
      return (
        Array.isArray(item.conditions) &&
        item.conditions.every((condition) => {
          if (typeof condition !== "object" || condition === null || Array.isArray(condition))
            return false;
          const value = condition as Record<string, unknown>;
          if (
            "secretToken" in value ||
            "code" in value ||
            "tagId" in value ||
            "secretParams" in value
          )
            return false;
          const type = value.type;
          if (type === "qr" || type === "passcode" || type === "nfc") return true;
          if (type === "custom") return typeof value.validatorName === "string";
          return (
            type === "gps" &&
            typeof value.latitude === "number" &&
            typeof value.longitude === "number" &&
            typeof value.radiusMeters === "number"
          );
        })
      );
    }) &&
    candidate.rewards.every((reward) => {
      if (typeof reward !== "object" || reward === null || Array.isArray(reward)) return false;
      const item = reward as Record<string, unknown>;
      return (
        typeof item.id === "string" &&
        typeof item.requiredStampCount === "number" &&
        (item.type === "digital" || item.type === "in_person") &&
        (item.redemptionMethod === "manual_slide" ||
          item.redemptionMethod === "staff_passcode" ||
          item.redemptionMethod === "view_only" ||
          item.redemptionMethod === "server_claim") &&
        !("staffPasscode" in item || "digitalContentUrl" in item)
      );
    })
  );
}

export interface StampRecord {
  readonly stampId: string;
  readonly acquiredAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export type SpotStatus = "UNCLAIMED" | "CLAIMED" | "LOCKED" | "VERIFYING";
export type RewardStatus = "LOCKED" | "AVAILABLE" | "CONSUMED" | "EXPIRED";
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
  readonly userId: string | null;
  readonly records: ReadonlyArray<StampRecord>;
  readonly rewards: ReadonlyArray<RewardState>;
  readonly inventory?: RallyInventoryState;
  readonly updatedAt: string;
}
export type UserRallyState = StampRallyState;
