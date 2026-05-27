const ADMIN_TZ = "America/Argentina/Buenos_Aires";

export type RegistrationUser = {
  uid: string;
  username: string;
  createdAt: string;
};

export type RegistrationDayRow = {
  dateKey: string;
  label: string;
  count: number;
  deltaVsPreviousDay: number | null;
  users: RegistrationUser[];
};

function parseCreatedAt(raw: unknown): Date | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toAdminDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: ADMIN_TZ });
}

function previousDayKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() - 1);
  return toAdminDayKey(anchor);
}

function formatDayLabel(dateKey: string, todayKey: string): string {
  const yesterdayKey = previousDayKey(todayKey);
  const dayBeforeYesterdayKey = previousDayKey(yesterdayKey);

  if (dateKey === todayKey) return "Hoy";
  if (dateKey === yesterdayKey) return "Ayer";
  if (dateKey === dayBeforeYesterdayKey) return "Anteayer";

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
  return date.toLocaleDateString("es-AR", {
    timeZone: ADMIN_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: dateKey.slice(0, 4) === todayKey.slice(0, 4) ? undefined : "numeric",
  });
}

export function buildUserRegistrationsByDay(
  rawUsers: Record<string, unknown>[],
  now = new Date(),
): RegistrationDayRow[] {
  const todayKey = toAdminDayKey(now);
  const buckets = new Map<string, RegistrationUser[]>();

  for (const user of rawUsers) {
    const createdAt =
      parseCreatedAt(user.createdAt) ||
      parseCreatedAt(user.updatedAt) ||
      parseCreatedAt(user.lastActiveAt);

    if (!createdAt) continue;

    const dateKey = toAdminDayKey(createdAt);
    const username = String(user.username || user.usernameLower || "").trim();
    if (!username) continue;

    const row: RegistrationUser = {
      uid: String(user.uid || user.id || ""),
      username,
      createdAt: createdAt.toISOString(),
    };

    const list = buckets.get(dateKey) || [];
    list.push(row);
    buckets.set(dateKey, list);
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const dayKeys = [...buckets.keys()].sort((a, b) => b.localeCompare(a));

  return dayKeys.map((dateKey) => {
    const users = buckets.get(dateKey) || [];
    const prevKey = previousDayKey(dateKey);
    const prevCount = buckets.get(prevKey)?.length ?? 0;

    return {
      dateKey,
      label: formatDayLabel(dateKey, todayKey),
      count: users.length,
      deltaVsPreviousDay: users.length - prevCount,
      users,
    };
  });
}

export function formatRegistrationDelta(
  delta: number | null,
  options?: { today?: boolean },
): string {
  if (delta === null) return "";
  const ref = options?.today ? "ayer" : "día anterior";
  if (delta === 0) return `igual que ${ref}`;
  if (delta > 0) return `+${delta} vs ${ref}`;
  return `${delta} vs ${ref}`;
}
