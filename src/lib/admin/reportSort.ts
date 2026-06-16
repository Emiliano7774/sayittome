export type AdminReportRecord = {
  id: string;
  tipo?: string;
  motivo?: string;
  createdAt?: unknown;
};

export function parseReportCreatedAtMs(value: unknown): number {
  if (!value) return 0;

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "object" && value !== null) {
    if ("toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
      const date = (value as { toDate: () => Date }).toDate();
      return date.getTime();
    }

    if ("seconds" in value) {
      return Number((value as { seconds?: number }).seconds || 0) * 1000;
    }
  }

  return 0;
}

export function isFakeProfileReport(report: AdminReportRecord) {
  const tipo = String(report.tipo || "").toLowerCase();
  const motivo = String(report.motivo || "").toLowerCase();
  return tipo === "perfil_falso" || motivo === "perfil_falso";
}

export function sortReportsNewestFirst<T extends AdminReportRecord>(reports: T[]) {
  return [...reports].sort(
    (left, right) => parseReportCreatedAtMs(right.createdAt) - parseReportCreatedAtMs(left.createdAt),
  );
}

export function filterAdminReports<T extends AdminReportRecord>(
  reports: T[],
  filter: "all" | "fake_profiles",
) {
  const sorted = sortReportsNewestFirst(reports);
  if (filter === "fake_profiles") {
    return sorted.filter(isFakeProfileReport);
  }
  return sorted;
}
