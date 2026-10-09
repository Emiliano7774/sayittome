export const INACTIVITY_MONTHS = 6;

export function valueToMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value && "toMillis" in value) {
    try {
      return Number((value as { toMillis: () => number }).toMillis()) || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export function addCalendarMonthsUtc(inputMs: number, months = INACTIVITY_MONTHS): number {
  const input = new Date(inputMs);
  if (!Number.isFinite(input.getTime())) return 0;
  const year = input.getUTCFullYear();
  const month = input.getUTCMonth();
  const day = input.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + months, 1));
  const targetYear = targetFirst.getUTCFullYear();
  const targetMonth = targetFirst.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);

  return Date.UTC(
    targetYear,
    targetMonth,
    clampedDay,
    input.getUTCHours(),
    input.getUTCMinutes(),
    input.getUTCSeconds(),
    input.getUTCMilliseconds(),
  );
}

export function resolveLastActivityMs(
  profile: Record<string, unknown>,
  authMetadata?: { lastSignInTime?: string; creationTime?: string },
): number {
  const candidates = [
    profile.lastActiveAt,
    profile.lastActive,
    profile.lastSeenAt,
    profile.presenceUpdatedAt,
    authMetadata?.lastSignInTime,
    profile.originalCreatedAt,
    profile.createdAt,
    profile.fechaCreacion,
    profile.fechaRegistro,
    profile.registrationDate,
    authMetadata?.creationTime,
  ].map(valueToMs);

  return Math.max(0, ...candidates);
}

export function inactivityDecision(input: {
  lastActivityMs: number;
  nowMs?: number;
  months?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const dueAtMs = addCalendarMonthsUtc(input.lastActivityMs, input.months ?? INACTIVITY_MONTHS);
  return {
    dueAtMs,
    expired: Boolean(dueAtMs && nowMs >= dueAtMs),
  };
}

export const MAX_TASK_HORIZON_MS = 28 * 24 * 60 * 60 * 1000;

export function nextInactivityCheckpointMs(input: {
  dueAtMs: number;
  nowMs?: number;
  maxHorizonMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const horizon = Math.max(60_000, input.maxHorizonMs ?? MAX_TASK_HORIZON_MS);
  if (!Number.isFinite(input.dueAtMs) || input.dueAtMs <= 0) return 0;
  if (input.dueAtMs <= nowMs) return nowMs;
  return Math.min(input.dueAtMs, nowMs + horizon);
}
