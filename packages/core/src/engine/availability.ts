import type { AvailabilityHours, RallyAvailability, SpotAvailability } from "../domain/models.js";

export type AvailabilityStatus = "OPEN" | "CLOSED" | "UPCOMING" | "ENDED";
export interface AvailabilityResult {
  readonly status: AvailabilityStatus;
  readonly reason?: "outside_schedule" | "temporary_closure" | "before_start" | "after_end";
  readonly currentPeriod?: AvailabilityHours;
  readonly todayHours?: ReadonlyArray<AvailabilityHours>;
  readonly nextOpening?: {
    readonly date: string;
    readonly dayOfWeek: number;
    readonly opensAt: string;
    readonly closesAt: string;
    readonly isToday: boolean;
  };
}

function localParts(now: string, timezone: string): { date: string; time: string; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = `${values.year}-${values.month}-${values.day}`;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(
    new Date(now),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return { date, time: `${values.hour}:${values.minute}`, day };
}

function containsTime(hours: ReadonlyArray<AvailabilityHours>, time: string): boolean {
  return hours.some(({ opensAt, closesAt }) =>
    closesAt > opensAt ? time >= opensAt && time < closesAt : time >= opensAt || time < closesAt,
  );
}

function findMatchingPeriod(
  hours: ReadonlyArray<AvailabilityHours>,
  time: string,
): AvailabilityHours | undefined {
  return hours.find(({ opensAt, closesAt }) =>
    closesAt > opensAt ? time >= opensAt && time < closesAt : time >= opensAt || time < closesAt,
  );
}

function addDays(date: string, offsetDays: number): string {
  const parts = date.split("-").map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const next = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return next.toISOString().slice(0, 10);
}

function hoursForDate(
  availability: SpotAvailability,
  date: string,
  dayOfWeek: number,
): ReadonlyArray<AvailabilityHours> {
  const exception = availability.exceptions?.find((item) => item.date === date);
  if (exception?.closed === true) return [];
  return (
    exception?.hours ??
    availability.weekly?.find((item) => item.dayOfWeek === dayOfWeek)?.hours ??
    []
  );
}

function findNextOpening(
  availability: SpotAvailability,
  current: { date: string; time: string; day: number },
): AvailabilityResult["nextOpening"] {
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = offset === 0 ? current.date : addDays(current.date, offset);
    const dayOfWeek = (current.day + offset) % 7;
    const hours = [...hoursForDate(availability, date, dayOfWeek)].sort((left, right) =>
      left.opensAt.localeCompare(right.opensAt),
    );
    for (const period of hours) {
      if (offset === 0 && period.opensAt <= current.time) continue;
      return {
        date,
        dayOfWeek,
        opensAt: period.opensAt,
        closesAt: period.closesAt,
        isToday: offset === 0,
      };
    }
  }
  return undefined;
}

export function evaluateRallyAvailability(
  availability: RallyAvailability | undefined,
  now: string,
): AvailabilityResult {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) return { status: "CLOSED", reason: "outside_schedule" };
  if (availability?.startsAt !== undefined && timestamp < Date.parse(availability.startsAt))
    return { status: "UPCOMING", reason: "before_start" };
  if (availability?.endsAt !== undefined && timestamp >= Date.parse(availability.endsAt))
    return { status: "ENDED", reason: "after_end" };
  return { status: "OPEN" };
}

export function evaluateSpotAvailability(
  availability: SpotAvailability | undefined,
  now: string,
): AvailabilityResult {
  if (availability === undefined) return { status: "OPEN" };
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) return { status: "CLOSED", reason: "outside_schedule" };
  const timezone = availability.timezone ?? "UTC";
  const current = localParts(now, timezone);
  const exception = availability.exceptions?.find(({ date }) => date === current.date);
  const todayHours = hoursForDate(availability, current.date, current.day);
  if (exception?.closed === true) {
    const nextOpening = findNextOpening(availability, current);
    return {
      status: "CLOSED",
      reason: "temporary_closure",
      todayHours,
      ...(nextOpening === undefined ? {} : { nextOpening }),
    };
  }
  const hours =
    exception?.hours ??
    availability.weekly?.find(({ dayOfWeek }) => dayOfWeek === current.day)?.hours;
  if (hours !== undefined && containsTime(hours, current.time)) {
    const currentPeriod = findMatchingPeriod(hours, current.time);
    return {
      status: "OPEN",
      todayHours,
      ...(currentPeriod === undefined ? {} : { currentPeriod }),
    };
  }
  const yesterday = (current.day + 6) % 7;
  const overnight = availability.weekly?.find(({ dayOfWeek }) => dayOfWeek === yesterday)?.hours;
  const overnightPeriod =
    exception?.hours === undefined
      ? overnight?.find(({ opensAt, closesAt }) => closesAt <= opensAt && current.time < closesAt)
      : undefined;
  if (overnightPeriod !== undefined)
    return {
      status: "OPEN",
      todayHours,
      currentPeriod: overnightPeriod,
    };
  const nextOpening = findNextOpening(availability, current);
  return {
    status: "CLOSED",
    reason: "outside_schedule",
    todayHours,
    ...(nextOpening === undefined ? {} : { nextOpening }),
  };
}
