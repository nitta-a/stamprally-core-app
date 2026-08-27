import type { SheetTheme } from "./models.js";

/** A human-readable value that may be supplied in one or more locales. */
export type UniversalLocalizedText<TLocale extends string = string> =
  | string
  | Partial<Record<TLocale, string>>;

/** A link to an entity owned by the host application or another system. */
export interface ExternalReference {
  readonly type: string;
  readonly id: string;
  readonly url?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Server-only verification material. Never send this shape to a browser. */
export type VerificationCondition =
  | { readonly type: "qr"; readonly secretToken: string; readonly qrEntryUrl?: string }
  | { readonly type: "passcode"; readonly code: string; readonly caseSensitive?: boolean }
  | {
      readonly type: "gps";
      readonly latitude: number;
      readonly longitude: number;
      readonly radiusMeters: number;
    }
  | {
      readonly type: "custom";
      readonly validatorName: string;
      readonly secretParams?: Readonly<Record<string, unknown>>;
    };

/** Safe condition metadata intended for a participant client. */
export type PublicCheckInCondition =
  | { readonly type: "qr"; readonly qrEntryUrl: string }
  | { readonly type: "passcode" }
  | {
      readonly type: "gps";
      readonly latitude: number;
      readonly longitude: number;
      readonly radiusMeters: number;
    }
  | { readonly type: "custom"; readonly validatorName: string };

export interface UniversalSpotItem<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly orderIndex: number;
  readonly name: UniversalLocalizedText<TLocale>;
  readonly description?: UniversalLocalizedText<TLocale>;
  readonly hint?: UniversalLocalizedText<TLocale>;
  readonly imageUrl?: string;
  readonly iconUrl?: string;
  readonly redirectUrlAfterClaim?: string;
  readonly externalReferences?: ReadonlyArray<ExternalReference>;
  readonly metadata?: TMeta;
  readonly conditions: ReadonlyArray<VerificationCondition>;
  readonly prerequisites?: ReadonlyArray<string>;
}

export type AdminReward<TLocale extends string = string> = {
  readonly id: string;
  readonly title: UniversalLocalizedText<TLocale>;
  readonly description?: UniversalLocalizedText<TLocale>;
  readonly type: "digital" | "in_person";
  readonly redemptionMethod: "manual_slide" | "staff_passcode" | "view_only" | "server_claim";
  readonly requiredStampCount: number;
  readonly conditions?: ReadonlyArray<RewardUnlockCondition>;
  readonly stockLimit?: number;
  readonly userClaimLimit?: number;
  readonly staffPasscode?: string;
  readonly digitalContentUrl?: string;
};

export type PublicReward<TLocale extends string = string> = Omit<
  AdminReward<TLocale>,
  "staffPasscode" | "digitalContentUrl"
>;

export type RewardUnlockCondition =
  | { readonly type: "stamp_count"; readonly count: number }
  | { readonly type: "stamps"; readonly stampIds: ReadonlyArray<string> }
  | { readonly type: "all" | "any"; readonly conditions: ReadonlyArray<RewardUnlockCondition> };

export interface AdminRallyConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly version: string;
  readonly title: UniversalLocalizedText<TLocale>;
  readonly description?: UniversalLocalizedText<TLocale>;
  readonly theme?: SheetTheme;
  readonly spots: ReadonlyArray<UniversalSpotItem<TLocale, TMeta>>;
  readonly rewards: ReadonlyArray<AdminReward<TLocale>>;
  readonly serverEndpoint?: string;
  readonly metadata?: TMeta;
}

export interface PublicRallyConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly version: string;
  readonly title: UniversalLocalizedText<TLocale>;
  readonly description?: UniversalLocalizedText<TLocale>;
  readonly theme?: SheetTheme;
  readonly spots: ReadonlyArray<
    Omit<UniversalSpotItem<TLocale, TMeta>, "conditions"> & {
      readonly conditions: ReadonlyArray<PublicCheckInCondition>;
    }
  >;
  readonly rewards: ReadonlyArray<PublicReward<TLocale>>;
  readonly serverEndpoint?: string;
  readonly metadata?: TMeta;
}

function toPublicCondition(condition: VerificationCondition): PublicCheckInCondition {
  switch (condition.type) {
    case "qr":
      return { type: "qr", qrEntryUrl: condition.qrEntryUrl ?? "" };
    case "passcode":
      return { type: "passcode" };
    case "gps":
      return {
        type: "gps",
        latitude: condition.latitude,
        longitude: condition.longitude,
        radiusMeters: condition.radiusMeters,
      };
    case "custom":
      return { type: "custom", validatorName: condition.validatorName };
  }
}

/** Produce the browser-safe projection without mutating the admin config. */
export function toPublicRallyConfig<TLocale extends string, TMeta extends Record<string, unknown>>(
  config: AdminRallyConfig<TLocale, TMeta>,
): PublicRallyConfig<TLocale, TMeta> {
  return {
    ...config,
    spots: config.spots.map((spot) => ({
      ...spot,
      conditions: spot.conditions.map(toPublicCondition),
    })),
    rewards: config.rewards.map(
      ({ staffPasscode: _staffPasscode, digitalContentUrl: _content, ...reward }) => reward,
    ),
  };
}

/** Runtime guard for values crossing the public configuration boundary. */
export function isPublicRallyConfig(value: unknown): value is PublicRallyConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as {
    spots?: unknown;
    rewards?: unknown;
    secretKey?: unknown;
    verificationSecrets?: unknown;
  };
  if (candidate.secretKey !== undefined || candidate.verificationSecrets !== undefined)
    return false;
  return (
    Array.isArray(candidate.spots) &&
    Array.isArray(candidate.rewards) &&
    candidate.spots.every((spot) => {
      if (typeof spot !== "object" || spot === null || Array.isArray(spot)) return false;
      const conditions = (spot as { conditions?: unknown }).conditions;
      return (
        Array.isArray(conditions) &&
        conditions.every((condition) => {
          if (typeof condition !== "object" || condition === null) return false;
          const type = (condition as { type?: unknown }).type;
          return type === "qr" || type === "passcode" || type === "gps" || type === "custom";
        })
      );
    }) &&
    candidate.rewards.every((reward) => {
      if (typeof reward !== "object" || reward === null || Array.isArray(reward)) return false;
      const item = reward as { staffPasscode?: unknown; digitalContentUrl?: unknown };
      return item.staffPasscode === undefined && item.digitalContentUrl === undefined;
    })
  );
}
