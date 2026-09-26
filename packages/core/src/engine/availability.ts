import type { AvailabilityHours, RallyAvailability, SpotAvailability } from "../domain/models.js";

export type AvailabilityStatus = "OPEN" | "CLOSED" | "UPCOMING" | "ENDED";
export interface AvailabilityResult {
  readonly status: AvailabilityStatus;
  readonly reason?: "outside_schedule" | "temporary_closure" | "before_start" | "after_end";
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
  if (exception?.closed === true) return { status: "CLOSED", reason: "temporary_closure" };
  const hours =
    exception?.hours ??
    availability.weekly?.find(({ dayOfWeek }) => dayOfWeek === current.day)?.hours;
  if (hours !== undefined && containsTime(hours, current.time)) return { status: "OPEN" };
  const yesterday = (current.day + 6) % 7;
  const overnight = availability.weekly?.find(({ dayOfWeek }) => dayOfWeek === yesterday)?.hours;
  if (
    exception?.hours === undefined &&
    overnight?.some(({ opensAt, closesAt }) => closesAt <= opensAt && current.time < closesAt)
  )
    return { status: "OPEN" };
  return { status: "CLOSED", reason: "outside_schedule" };
}
