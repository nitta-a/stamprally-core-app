import type { RallyConfig, RewardItem } from "./models.js";
import {
  type AdminRallyConfig,
  toPublicRallyConfig,
  type PublicRallyConfig as UniversalPublicRallyConfig,
} from "./universalModel.js";

export type PublicRewardItem<TLocale extends string = string> = Omit<
  RewardItem<TLocale>,
  "staffPasscode"
>;
export type LegacyPublicRallyConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = Omit<RallyConfig<TLocale, TMeta>, "rewards"> & {
  readonly rewards?: ReadonlyArray<PublicRewardItem<TLocale>>;
};

export function stripSensitiveConfig<TLocale extends string, TMeta extends Record<string, unknown>>(
  config: AdminRallyConfig<TLocale, TMeta>,
): UniversalPublicRallyConfig<TLocale, TMeta>;
export function stripSensitiveConfig<TLocale extends string, TMeta extends Record<string, unknown>>(
  config: RallyConfig<TLocale, TMeta>,
): LegacyPublicRallyConfig<TLocale, TMeta>;
export function stripSensitiveConfig<TLocale extends string, TMeta extends Record<string, unknown>>(
  config: AdminRallyConfig<TLocale, TMeta> | RallyConfig<TLocale, TMeta>,
): UniversalPublicRallyConfig<TLocale, TMeta> | LegacyPublicRallyConfig<TLocale, TMeta> {
  if ("spots" in config && !("stamps" in config)) {
    return toPublicRallyConfig(config as unknown as AdminRallyConfig<TLocale, TMeta>);
  }
  const rewards = config.rewards?.map(({ staffPasscode: _staffPasscode, ...reward }) => reward);
  return {
    ...config,
    ...(rewards === undefined ? {} : { rewards }),
  } as LegacyPublicRallyConfig<TLocale, TMeta>;
}
