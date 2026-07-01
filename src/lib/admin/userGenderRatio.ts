import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { resolveProfileCreatedAt } from "@/lib/profile/resolveProfileCreatedAt";
import { sexToStorage } from "@/lib/shuffle/filters";

export type GenderBucket = "hombre" | "mujer" | "otro" | "sin_dato";

export type GenderRatioSummary = {
  hombre: number;
  mujer: number;
  otro: number;
  sinDato: number;
  total: number;
  genderedTotal: number;
  percentages: Record<GenderBucket, number>;
  ratioLabel: string;
  womenPerMan: number | null;
  menPerWoman: number | null;
};

function pickBestProfileRow(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) => {
    const aPublic = isPublicProfile(a) ? 1 : 0;
    const bPublic = isPublicProfile(b) ? 1 : 0;
    if (aPublic !== bPublic) return bPublic - aPublic;

    const aDocMatchesUid = String(a.id || "") === String(a.uid || a.id || "") ? 1 : 0;
    const bDocMatchesUid = String(b.id || "") === String(b.uid || b.id || "") ? 1 : 0;
    if (aDocMatchesUid !== bDocMatchesUid) return bDocMatchesUid - aDocMatchesUid;

    const aCreated = resolveProfileCreatedAt(a)?.getTime() || 0;
    const bCreated = resolveProfileCreatedAt(b)?.getTime() || 0;
    return aCreated - bCreated;
  })[0];
}

function normalizeGenderBucket(sexo: unknown): GenderBucket {
  const stored = sexToStorage(String(sexo || ""));
  if (stored === "hombre" || stored === "mujer" || stored === "otro") {
    return stored;
  }
  return "sin_dato";
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = y;
    y = x % y;
    x = next;
  }
  return x || 1;
}

function formatRatioLabel(hombre: number, mujer: number): string {
  if (hombre <= 0 && mujer <= 0) return "Sin datos de género";
  if (hombre <= 0) return `0 hombres : ${mujer} mujeres`;
  if (mujer <= 0) return `${hombre} hombres : 0 mujeres`;

  const divisor = gcd(hombre, mujer);
  return `${hombre / divisor} hombres : ${mujer / divisor} mujeres`;
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export function buildUserGenderRatio(
  rawUsers: Record<string, unknown>[],
): GenderRatioSummary {
  const counts: Record<GenderBucket, number> = {
    hombre: 0,
    mujer: 0,
    otro: 0,
    sin_dato: 0,
  };

  const byUid = new Map<string, Record<string, unknown>[]>();

  for (const user of rawUsers) {
    const uid = String(user.uid || user.id || "").trim();
    if (!uid) continue;
    const group = byUid.get(uid) || [];
    group.push(user);
    byUid.set(uid, group);
  }

  for (const group of byUid.values()) {
    const user = pickBestProfileRow(group);
    if (!isPublicProfile(user)) continue;

    const bucket = normalizeGenderBucket(user.sexo);
    counts[bucket] += 1;
  }

  const total = counts.hombre + counts.mujer + counts.otro + counts.sin_dato;
  const genderedTotal = counts.hombre + counts.mujer;

  return {
    hombre: counts.hombre,
    mujer: counts.mujer,
    otro: counts.otro,
    sinDato: counts.sin_dato,
    total,
    genderedTotal,
    percentages: {
      hombre: pct(counts.hombre, total),
      mujer: pct(counts.mujer, total),
      otro: pct(counts.otro, total),
      sin_dato: pct(counts.sin_dato, total),
    },
    ratioLabel: formatRatioLabel(counts.hombre, counts.mujer),
    womenPerMan:
      counts.hombre > 0 ? Math.round((counts.mujer / counts.hombre) * 100) / 100 : null,
    menPerWoman:
      counts.mujer > 0 ? Math.round((counts.hombre / counts.mujer) * 100) / 100 : null,
  };
}

export const GENDER_BUCKET_LABELS: Record<
  GenderBucket,
  { label: string; barClass: string }
> = {
  hombre: { label: "Hombres", barClass: "bg-sky-500/85" },
  mujer: { label: "Mujeres", barClass: "bg-pink-500/85" },
  otro: { label: "Otros", barClass: "bg-violet-500/75" },
  sin_dato: { label: "Sin dato", barClass: "bg-white/25" },
};

export function bucketCount(summary: GenderRatioSummary, bucket: GenderBucket) {
  if (bucket === "sin_dato") return summary.sinDato;
  return summary[bucket];
}
