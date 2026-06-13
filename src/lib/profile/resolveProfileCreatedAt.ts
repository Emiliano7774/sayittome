function parseTimestamp(raw: unknown): Date | null {
  if (!raw) return null;

  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    const date = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const value = String(raw).trim();
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Earliest trustworthy profile creation instant for a usuario document. */
export function resolveProfileCreatedAt(user: Record<string, unknown>): Date | null {
  const candidates: Date[] = [];

  for (const key of [
    "originalCreatedAt",
    "createdAt",
    "fechaCreacion",
    "fechaRegistro",
    "registrationDate",
    "_firestoreCreateTime",
  ]) {
    const parsed = parseTimestamp(user[key]);
    if (parsed) candidates.push(parsed);
  }

  if (candidates.length === 0) return null;

  return new Date(Math.min(...candidates.map((date) => date.getTime())));
}

export function resolveProfileCreatedAtIso(user: Record<string, unknown>): string {
  const date = resolveProfileCreatedAt(user);
  return date ? date.toISOString() : "";
}

export function formatProfileCreatedAtLabel(
  user: Record<string, unknown>,
  localeTag = "es-AR",
): string {
  const date = resolveProfileCreatedAt(user);
  if (!date) return "";

  return date.toLocaleDateString(localeTag, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
