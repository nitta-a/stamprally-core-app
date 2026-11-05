import type { AvailabilityResult, LocaleDictionary } from "@stamprally/core";
import { resolveUiLabel } from "./index.js";

export function formatAvailabilityDetail<TLocale extends string>(
  availability: AvailabilityResult | undefined,
  locale: TLocale,
  timezone: string,
  dictionary?: LocaleDictionary<TLocale>,
): string | null {
  if (availability === undefined) return null;
  const label = (key: string, fallback: string) =>
    resolveUiLabel(dictionary, locale, key, fallback);
  if (availability.status === "UPCOMING")
    return label("availability.rallyUpcoming", "Rally has not started");
  if (availability.status === "ENDED") return label("availability.rallyEnded", "Rally has ended");
  if (availability.status === "OPEN") {
    if (availability.currentPeriod === undefined) return null;
    return label("availability.openPeriod", "Open ({opens}–{closes} {timezone})")
      .replace("{opens}", availability.currentPeriod.opensAt)
      .replace("{closes}", availability.currentPeriod.closesAt)
      .replace("{timezone}", timezone);
  }
  const reason =
    availability.reason === "temporary_closure"
      ? label("availability.closedToday", "Closed today")
      : label("availability.outsideHours", "Outside opening hours");
  if (availability.nextOpening === undefined) return reason;
  const { date, opensAt, isToday } = availability.nextOpening;
  const next = isToday
    ? label("availability.opensToday", "Spot opens today at {time} {timezone}")
    : label("availability.nextSpotOpening", "Next spot opening {date} {time} {timezone}");
  return `${reason} · ${next.replace("{date}", date).replace("{time}", opensAt).replace("{timezone}", timezone)}`;
}
