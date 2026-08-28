import type { SpotItem } from "../domain/index.js";
export function getOrderedSpots<TLocale extends string, TMeta extends Record<string, unknown>>(
  spots: ReadonlyArray<SpotItem<TLocale, TMeta>>,
): ReadonlyArray<SpotItem<TLocale, TMeta>> {
  return [...spots].sort((left, right) => left.orderIndex - right.orderIndex);
}
