function dateParts(timestamp: number, timezone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(timestamp)
      .map(({ type, value }) => [type, value]),
  );
}

export function formatDateTimeLocal(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  try {
    const parts = dateParts(timestamp, timezone);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return new Date(timestamp).toISOString().slice(0, 16);
  }
}

export function parseDateTimeLocal(value: string, timezone: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const [, year, month, day, hour, minute] = match;
  const wallTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  if (new Date(wallTime).toISOString().slice(0, 16) !== value) return undefined;
  if (!Number.isFinite(wallTime)) return undefined;
  let timestamp = wallTime;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const parts = dateParts(timestamp, timezone);
      const represented = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
      );
      timestamp += wallTime - represented;
    }
  } catch {
    timestamp = wallTime;
  }
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}
