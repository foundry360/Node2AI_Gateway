const ALLOWED_DAYS = new Set([7, 30, 60, 90]);

export function parseDaysQuery(query: unknown, fallback = 30): number {
  const raw = (query as { days?: string } | undefined)?.days;
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || !ALLOWED_DAYS.has(n)) return fallback;
  return n;
}

export function eventWithinDays(
  timestamp: string,
  days: number,
  nowMs = Date.now(),
): boolean {
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t)) return false;
  return t >= nowMs - days * 24 * 60 * 60 * 1000;
}

export function filterEventsByDays<T extends { timestamp: string }>(
  events: T[],
  days: number,
): T[] {
  const nowMs = Date.now();
  return events.filter((e) => eventWithinDays(e.timestamp, days, nowMs));
}
