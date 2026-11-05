import type { LocaleDictionary } from "@stamprally/core";
import { resolveUiLabel } from "../locales/index.js";

export function confirmReward<TLocale extends string>(
  name: string,
  locale: TLocale,
  dictionary?: LocaleDictionary<TLocale>,
): boolean {
  const message = resolveUiLabel(
    dictionary,
    locale,
    "reward.confirmRedemption",
    "Redeem {reward}? It may not be available again after redemption.",
  );
  return window.confirm(message.replace("{reward}", name));
}
