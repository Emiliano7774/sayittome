import type { AppLocale } from "@/lib/i18n/types";

export function formatBoostMinutesReward(minutes: number, locale: AppLocale = "es"): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (locale === "es") {
    if (hours === 1 && mins === 30) return "1 hora y media";
    if (hours > 0 && mins === 0) return hours === 1 ? "1 hora" : `${hours} horas`;
    if (hours > 0 && mins > 0) return `${hours} h ${mins} min`;
    return `${minutes} min`;
  }

  if (hours === 1 && mins === 30) return "1½ hours";
  if (hours > 0 && mins === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  if (hours > 0 && mins > 0) return `${hours} h ${mins} min`;
  return `${minutes} min`;
}
