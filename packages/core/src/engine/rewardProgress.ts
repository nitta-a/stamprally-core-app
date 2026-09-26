import type {
  PublicRallyConfig,
  RewardUnlockCondition,
  StampRallyState,
} from "../domain/models.js";

export interface RewardProgress {
  readonly rewardId: string;
  readonly isUnlocked: boolean;
  readonly acquired: number;
  readonly required: number;
  readonly percentage: number;
  readonly missingStampIds: ReadonlyArray<string>;
}

function isConditionUnlocked(
  condition: RewardUnlockCondition,
  acquired: ReadonlySet<string>,
): boolean {
  if (condition.type === "stamp_count") return acquired.size >= condition.count;
  if (condition.type === "stamps") return condition.stampIds.every((id) => acquired.has(id));
  const results = condition.conditions.map((child) => isConditionUnlocked(child, acquired));
  return condition.type === "all" ? results.every(Boolean) : results.some(Boolean);
}

interface Requirement {
  readonly stampIds: ReadonlySet<string>;
  readonly count: number;
}

function requirement(
  condition: RewardUnlockCondition,
  acquired: ReadonlySet<string>,
  spotIds: ReadonlyArray<string>,
): Requirement {
  if (condition.type === "stamp_count") return { stampIds: new Set(), count: condition.count };
  if (condition.type === "stamps") return { stampIds: new Set(condition.stampIds), count: 0 };
  const children = condition.conditions.map((child) => requirement(child, acquired, spotIds));
  if (condition.type === "all") {
    const stampIds = new Set(children.flatMap((child) => [...child.stampIds]));
    return { stampIds, count: Math.max(0, ...children.map((child) => child.count)) };
  }
  const best = [...children].sort((left, right) => {
    const missing = (item: Requirement): number =>
      Math.max(0, item.count - acquired.size) +
      [...item.stampIds].filter((id) => !acquired.has(id)).length;
    return missing(left) - missing(right);
  })[0];
  return best ?? { stampIds: new Set(), count: 0 };
}

export function calculateRewardProgress(
  rewardId: string,
  state: StampRallyState,
  config: PublicRallyConfig,
): RewardProgress | undefined {
  const reward = config.rewards.find(({ id }) => id === rewardId);
  if (reward === undefined) return undefined;
  const spotIds = config.spots.map(({ id }) => id);
  const validIds = new Set(spotIds);
  const acquired = new Set(
    state.records.map(({ stampId }) => stampId).filter((id) => validIds.has(id)),
  );
  const explicitIds = new Set<string>();
  let count = reward.requiredStampCount;
  for (const condition of reward.conditions ?? []) {
    const part = requirement(condition, acquired, spotIds);
    for (const id of part.stampIds) explicitIds.add(id);
    count = Math.max(count, part.count);
  }
  const missingStampIds = [...explicitIds].filter((id) => !acquired.has(id));
  const required = Math.max(explicitIds.size, count);
  const missingCount = required - explicitIds.size;
  for (const id of spotIds
    .filter((candidate) => !acquired.has(candidate) && !explicitIds.has(candidate))
    .slice(0, missingCount))
    missingStampIds.push(id);
  const acquiredCount = required - missingStampIds.length;
  const isUnlocked =
    acquired.size >= reward.requiredStampCount &&
    (reward.conditions ?? []).every((condition) => isConditionUnlocked(condition, acquired));
  return {
    rewardId,
    isUnlocked,
    acquired: acquiredCount,
    required,
    percentage: required === 0 ? 100 : Math.min(100, (acquiredCount / required) * 100),
    missingStampIds,
  };
}
