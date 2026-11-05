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

function requirements(condition: RewardUnlockCondition): ReadonlyArray<Requirement> {
  if (condition.type === "stamp_count") return [{ stampIds: new Set(), count: condition.count }];
  if (condition.type === "stamps") return [{ stampIds: new Set(condition.stampIds), count: 0 }];
  if (condition.type === "any") return condition.conditions.flatMap(requirements);
  return combineRequirements(condition.conditions);
}

function combineRequirements(conditions: ReadonlyArray<RewardUnlockCondition>): Requirement[] {
  let combined: Requirement[] = [{ stampIds: new Set(), count: 0 }];
  for (const condition of conditions) {
    combined = combined.flatMap((left) =>
      requirements(condition).map((right) => ({
        stampIds: new Set([...left.stampIds, ...right.stampIds]),
        count: Math.max(left.count, right.count),
      })),
    );
  }
  return combined;
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
  const alternatives = combineRequirements(reward.conditions ?? []);
  const missingCountFor = (item: Requirement): number => {
    const missingExplicit = [...item.stampIds].filter((id) => !acquired.has(id)).length;
    return Math.max(
      missingExplicit,
      Math.max(reward.requiredStampCount, item.count) - acquired.size,
    );
  };
  const best = alternatives.reduce<Requirement | undefined>((selected, item) => {
    if (selected === undefined || missingCountFor(item) < missingCountFor(selected)) return item;
    return selected;
  }, undefined);
  const explicitIds = best?.stampIds ?? new Set<string>();
  const count = Math.max(reward.requiredStampCount, best?.count ?? 0);
  const missingStampIds = [...explicitIds].filter((id) => !acquired.has(id));
  const required = Math.max(explicitIds.size, count);
  const acquiredExplicit = explicitIds.size - missingStampIds.length;
  const acquiredOther = acquired.size - acquiredExplicit;
  const extraRequired = required - explicitIds.size;
  const missingCount = Math.max(0, extraRequired - acquiredOther);
  for (const id of spotIds
    .filter((candidate) => !acquired.has(candidate) && !explicitIds.has(candidate))
    .slice(0, missingCount))
    missingStampIds.push(id);
  const acquiredCount = acquiredExplicit + Math.min(acquiredOther, extraRequired);
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
