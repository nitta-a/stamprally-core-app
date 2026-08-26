import type { RallyConfig, RewardItem } from "./models.js";

export type PublicRewardItem<TLocale extends string = string> = Omit<
  RewardItem<TLocale>,
  "staffPasscode"
>;
export type PublicRallyConfig<
  TLocale extends string = string,
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> = Omit<RallyConfig<TLocale, TMeta>, "rewards"> & {
  readonly rewards?: ReadonlyArray<PublicRewardItem<TLocale>>;
};

export function stripSensitiveConfig<TLocale extends string, TMeta extends Record<string, unknown>>(
  config: RallyConfig<TLocale, TMeta>,
): PublicRallyConfig<TLocale, TMeta> {
  const rewards = config.rewards?.map(({ staffPasscode: _staffPasscode, ...reward }) => reward);
  return {
    ...config,
    ...(rewards === undefined ? {} : { rewards }),
  };
}
