import type { RallyConfig, StampDefinition } from "../domain/index.js";

interface OrderedStamp {
  readonly stamp: StampDefinition;
  readonly index: number;
}

export function getOrderedStamps(config: RallyConfig): ReadonlyArray<StampDefinition> {
  return config.stamps
    .map((stamp, index): OrderedStamp => ({ stamp, index }))
    .sort((left, right) => {
      const orderDifference =
        (left.stamp.orderIndex ?? left.stamp.order ?? Number.POSITIVE_INFINITY) -
        (right.stamp.orderIndex ?? right.stamp.order ?? Number.POSITIVE_INFINITY);
      return orderDifference === 0 ? left.index - right.index : orderDifference;
    })
    .map(({ stamp }) => stamp);
}
