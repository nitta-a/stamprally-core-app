import type {
  AdminRallyConfig,
  CompletionCondition,
  PublicRallyConfig,
  RewardUnlockCondition,
  SpotAvailability,
} from "../domain/models.js";

export interface ExperienceIssue {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly path?: string;
  readonly message: string;
  readonly relatedIds?: ReadonlyArray<string>;
}
export interface RallySimulation {
  readonly reachableSpotIds: ReadonlyArray<string>;
  readonly unlockedRewardIds: ReadonlyArray<string>;
  readonly isCompleted: boolean;
}
export interface ExperiencePreflightOptions {
  readonly targetLocales?: ReadonlyArray<string>;
}

function canReachCondition(
  condition: RewardUnlockCondition,
  reachable: ReadonlySet<string>,
): boolean {
  if (condition.type === "stamp_count") return condition.count <= reachable.size;
  if (condition.type === "stamps") return condition.stampIds.every((id) => reachable.has(id));
  const checks = condition.conditions.map((child) => canReachCondition(child, reachable));
  return condition.type === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

function canComplete(
  condition: CompletionCondition,
  reachable: ReadonlySet<string>,
  total: number,
): boolean {
  if (condition.type === "all_spots") return total > 0 && reachable.size === total;
  if (condition.type === "stamp_count")
    return condition.count > 0 && condition.count <= reachable.size;
  return condition.stampIds.length > 0 && condition.stampIds.every((id) => reachable.has(id));
}

function localDate(timestamp: number, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(timestamp);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localDateTimeToTimestamp(
  date: string,
  time: string,
  formatter: Intl.DateTimeFormat,
): number {
  const dateParts = date.split("-").map(Number);
  const timeParts = time.split(":").map(Number);
  const year = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 1;
  const day = dateParts[2] ?? 1;
  const hour = timeParts[0] ?? 0;
  const minute = timeParts[1] ?? 0;
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = wallTime;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = formatter.formatToParts(timestamp);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    timestamp += wallTime - represented;
  }
  return timestamp;
}

function hasOpeningDuring(
  availability: SpotAvailability | undefined,
  start: string | undefined,
  end: string | undefined,
): boolean | undefined {
  if (availability === undefined) return true;
  if (start === undefined || end === undefined) return undefined;
  const startsAt = Date.parse(start);
  const endsAt = Date.parse(end);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt)
    return undefined;
  const timezone = availability.timezone ?? "UTC";
  try {
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const firstDate = localDate(startsAt, dateFormatter);
    const lastDate = localDate(endsAt, dateFormatter);
    const dateCursor = new Date(`${firstDate}T00:00:00Z`);
    dateCursor.setUTCDate(dateCursor.getUTCDate() - 1);
    const lastDay = Date.parse(`${lastDate}T00:00:00Z`);
    // ponytail: cap daily scans at one year; use recurrence math if longer rallies need exact analysis.
    if (lastDay - dateCursor.getTime() > 366 * 24 * 60 * 60 * 1000) return undefined;
    while (dateCursor.getTime() <= lastDay) {
      const date = dateCursor.toISOString().slice(0, 10);
      const exception = availability.exceptions?.find((item) => item.date === date);
      if (exception?.closed !== true) {
        const weekday = dateCursor.getUTCDay();
        const hours =
          exception?.hours ??
          availability.weekly?.find((item) => item.dayOfWeek === weekday)?.hours;
        for (const period of hours ?? []) {
          const closesNextDay = period.closesAt <= period.opensAt;
          const nextDate = new Date(dateCursor.getTime());
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
          const closingDate = closesNextDay ? nextDate.toISOString().slice(0, 10) : date;
          const open = localDateTimeToTimestamp(date, period.opensAt, dateTimeFormatter);
          const close = localDateTimeToTimestamp(closingDate, period.closesAt, dateTimeFormatter);
          const nextDateHasException =
            closesNextDay && availability.exceptions?.some((item) => item.date === closingDate);
          const effectiveClose = nextDateHasException
            ? localDateTimeToTimestamp(closingDate, "00:00", dateTimeFormatter)
            : close;
          if (open < endsAt && effectiveClose > startsAt) return true;
        }
      }
      dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
    }
  } catch {
    return undefined;
  }
  return false;
}

function conditionCanBeSatisfiedWithin(
  condition: RewardUnlockCondition,
  availableSpotIds: ReadonlySet<string>,
): boolean {
  if (condition.type === "stamp_count") return condition.count <= availableSpotIds.size;
  if (condition.type === "stamps")
    return condition.stampIds.every((id) => availableSpotIds.has(id));
  const checks = condition.conditions.map((child) =>
    conditionCanBeSatisfiedWithin(child, availableSpotIds),
  );
  return condition.type === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

export function simulateRallyProgression(
  config: AdminRallyConfig | PublicRallyConfig,
): RallySimulation {
  const reachable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const spot of config.spots) {
      if (reachable.has(spot.id) || spot.prerequisites?.some((id) => !reachable.has(id))) continue;
      reachable.add(spot.id);
      changed = true;
    }
  }
  const unlockedRewardIds = config.rewards
    .filter(
      (reward) =>
        reward.requiredStampCount <= reachable.size &&
        (reward.conditions ?? []).every((condition) => canReachCondition(condition, reachable)),
    )
    .map(({ id }) => id);
  const completion = config.completion?.condition ?? { type: "all_spots" as const };
  return {
    reachableSpotIds: config.spots.filter(({ id }) => reachable.has(id)).map(({ id }) => id),
    unlockedRewardIds,
    isCompleted: canComplete(completion, reachable, config.spots.length),
  };
}

export function analyzeRallyExperience(
  config: AdminRallyConfig | PublicRallyConfig,
  options: ExperiencePreflightOptions = {},
): ReadonlyArray<ExperienceIssue> {
  const issues: ExperienceIssue[] = [];
  const simulation = simulateRallyProgression(config);
  const reachable = new Set(simulation.reachableSpotIds);
  const known = new Set(config.spots.map(({ id }) => id));
  const hasBoundedRallyPeriod =
    config.availability?.startsAt !== undefined && config.availability.endsAt !== undefined;
  const openDuringRally = new Set(
    config.spots
      .filter(
        ({ availability }) =>
          hasOpeningDuring(
            availability,
            config.availability?.startsAt,
            config.availability?.endsAt,
          ) !== false,
      )
      .map(({ id }) => id),
  );
  const reachableDuringRally = new Set<string>();
  let availabilityChanged = true;
  while (availabilityChanged) {
    availabilityChanged = false;
    for (const spot of config.spots) {
      if (
        !openDuringRally.has(spot.id) ||
        reachableDuringRally.has(spot.id) ||
        spot.prerequisites?.some((id) => !reachableDuringRally.has(id))
      )
        continue;
      reachableDuringRally.add(spot.id);
      availabilityChanged = true;
    }
  }
  const availabilityBlocked = config.spots.filter(
    ({ id }) => reachable.has(id) && !reachableDuringRally.has(id),
  );
  if (hasBoundedRallyPeriod && availabilityBlocked.length > 0)
    issues.push({
      severity: "error",
      code: "availability_blocked_spots",
      path: "spots",
      message: "Some reachable spots cannot be opened during the configured rally period.",
      relatedIds: availabilityBlocked.map(({ id }) => id),
    });
  const unreachable = config.spots.filter(({ id }) => !reachable.has(id));
  if (unreachable.length > 0)
    issues.push({
      severity: "error",
      code: "unreachable_spots",
      path: "spots",
      message: "Some spots cannot be reached from the initial state.",
      relatedIds: unreachable.map(({ id }) => id),
    });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleIds = new Set<string>();
  const visit = (id: string, path: ReadonlyArray<string>): void => {
    if (visiting.has(id)) {
      for (const cycleId of path.slice(path.indexOf(id))) cycleIds.add(cycleId);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const spot = config.spots.find(({ id: spotId }) => spotId === id);
    for (const prerequisite of spot?.prerequisites ?? [])
      visit(prerequisite, [...path, prerequisite]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const spot of config.spots) visit(spot.id, [spot.id]);
  if (cycleIds.size > 0)
    issues.push({
      severity: "error",
      code: "prerequisite_cycle",
      path: "spots",
      message: "Spot prerequisites contain a cycle.",
      relatedIds: [...cycleIds],
    });
  if (!simulation.isCompleted)
    issues.push({
      severity: "error",
      code: "impossible_completion",
      path: "completion",
      message: "The rally completion condition cannot be reached.",
    });
  if (hasBoundedRallyPeriod) {
    const completion = config.completion?.condition ?? { type: "all_spots" as const };
    const canCompleteInPeriod =
      completion.type === "all_spots"
        ? config.spots.length > 0 && reachableDuringRally.size === config.spots.length
        : completion.type === "stamp_count"
          ? completion.count > 0 && completion.count <= reachableDuringRally.size
          : completion.stampIds.every((id) => reachableDuringRally.has(id));
    if (simulation.isCompleted && !canCompleteInPeriod)
      issues.push({
        severity: "error",
        code: "completion_availability_conflict",
        path: "completion",
        message: "The completion condition cannot be reached during the configured rally period.",
      });
  }
  if (
    config.spots.length > 2 &&
    config.spots.filter(({ prerequisites }) => (prerequisites?.length ?? 0) > 0).length /
      config.spots.length >=
      0.75
  )
    issues.push({
      severity: "warning",
      code: "strong_order_dependency",
      path: "spots",
      message: "Most spots depend on other spots, which may restrict the participant's route.",
    });
  for (const reward of config.rewards) {
    const possible =
      reward.requiredStampCount <= reachable.size &&
      (reward.conditions ?? []).every((condition) => canReachCondition(condition, reachable));
    if (!possible)
      issues.push({
        severity: "error",
        code: "impossible_reward",
        path: `rewards.${reward.id}`,
        message: "This reward cannot be unlocked with the reachable spots.",
        relatedIds: [reward.id],
      });
    if (
      hasBoundedRallyPeriod &&
      possible &&
      (reward.requiredStampCount > reachableDuringRally.size ||
        !(reward.conditions ?? []).every((condition) =>
          conditionCanBeSatisfiedWithin(condition, reachableDuringRally),
        ))
    )
      issues.push({
        severity: "error",
        code: "reward_availability_conflict",
        path: `rewards.${reward.id}`,
        message: "This reward cannot be unlocked during the configured rally period.",
        relatedIds: [reward.id],
      });
    if ((reward.conditions?.length ?? 0) === 0 && reward.requiredStampCount > 0)
      issues.push({
        severity: "info",
        code: "reward_progress_count_only",
        path: `rewards.${reward.id}`,
        message:
          "This reward progress is based on a stamp count and does not identify specific spots.",
      });
    if (
      reward.validUntil !== undefined &&
      config.availability?.endsAt !== undefined &&
      Date.parse(reward.validUntil) < Date.parse(config.availability.endsAt)
    )
      issues.push({
        severity: "warning",
        code: "reward_expires_before_rally",
        path: `rewards.${reward.id}.validUntil`,
        message: "This reward expires before the rally ends.",
        relatedIds: [reward.id],
      });
  }
  for (const spot of config.spots) {
    for (const prerequisite of spot.prerequisites ?? [])
      if (!known.has(prerequisite))
        issues.push({
          severity: "error",
          code: "missing_prerequisite",
          path: `spots.${spot.id}.prerequisites`,
          message: "A prerequisite spot does not exist.",
          relatedIds: [spot.id, prerequisite],
        });
    const gps = spot.conditions.some(({ type }) => type === "gps");
    if (gps && spot.location === undefined)
      issues.push({
        severity: "warning",
        code: "gps_without_location",
        path: `spots.${spot.id}.location`,
        message: "GPS check-in is configured without a participant navigation location.",
        relatedIds: [spot.id],
      });
    if (
      spot.conditions.length === 0 ||
      spot.conditions.every(({ type }) => type === "nfc" || type === "custom")
    )
      issues.push({
        severity: "warning",
        code: "limited_checkin_fallback",
        path: `spots.${spot.id}.conditions`,
        message: "This spot has no broadly available fallback check-in method.",
        relatedIds: [spot.id],
      });
    if (
      spot.availability !== undefined &&
      (spot.availability.weekly ?? []).every(({ hours }) => hours.length === 0) &&
      (spot.availability.exceptions ?? []).every(
        ({ closed, hours }) => closed === true || (hours?.length ?? 0) === 0,
      )
    )
      issues.push({
        severity: "error",
        code: "spot_never_open",
        path: `spots.${spot.id}.availability`,
        message: "This spot has no opening hours.",
        relatedIds: [spot.id],
      });
    for (const locale of options.targetLocales ?? []) {
      const name = typeof spot.name === "string" ? spot.name : spot.name[locale];
      if (name?.trim()) continue;
      issues.push({
        severity: "warning",
        code: "missing_localization",
        path: `spots.${spot.id}.name.${locale}`,
        message: `A participant-visible spot name is missing for ${locale}.`,
        relatedIds: [spot.id],
      });
    }
  }
  for (const locale of options.targetLocales ?? []) {
    const rallyTitle = typeof config.title === "string" ? config.title : config.title[locale];
    if (!rallyTitle?.trim())
      issues.push({
        severity: "warning",
        code: "missing_localization",
        path: `title.${locale}`,
        message: `A participant-visible rally title is missing for ${locale}.`,
      });
  }
  for (const reward of config.rewards) {
    for (const locale of options.targetLocales ?? []) {
      const title = typeof reward.title === "string" ? reward.title : reward.title[locale];
      if (!title?.trim())
        issues.push({
          severity: "warning",
          code: "missing_localization",
          path: `rewards.${reward.id}.title.${locale}`,
          message: `A participant-visible reward title is missing for ${locale}.`,
          relatedIds: [reward.id],
        });
    }
  }
  return issues;
}
