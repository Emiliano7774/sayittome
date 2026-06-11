"use client";

import { Check, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import { getCountryByCode, getSubdivisionsForCountry, SHUFFLE_COUNTRIES } from "@/lib/geo/countries";
import {
  defaultShuffleFilters,
  normalizeInterests,
  parseOptionalAge,
  SHUFFLE_GENDER_OPTIONS,
  SHUFFLE_INTEREST_OPTIONS,
  shuffleFiltersHasAny,
  shuffleFiltersSummary,
  type ShuffleFilters,
} from "@/lib/shuffle/filters";

type Props = {
  open: boolean;
  applied: ShuffleFilters;
  variant?: "classic" | "modern";
  onClose: () => void;
  onApply: (filters: ShuffleFilters) => void;
  onClear: () => void;
};

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  variant,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
  variant: "classic" | "modern";
}) {
  const trackClass =
    variant === "modern"
      ? value
        ? "bg-violet-600"
        : "bg-white/15"
      : value
        ? "bg-[#8C84FF]"
        : "bg-white/15";

  return (
    <div className="mb-2.5 rounded-[18px] border border-white/[0.075] bg-white/[0.045] px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">{title}</p>
          <p className="mt-1 text-[12px] font-bold leading-snug text-white/60">{subtitle}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          onClick={() => onChange(!value)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${trackClass}`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
              value ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export default function ShuffleFiltersSheet({
  open,
  applied,
  variant = "classic",
  onClose,
  onApply,
  onClear,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState<ShuffleFilters>(applied);
  const [edadMinText, setEdadMinText] = useState("");
  const [edadMaxText, setEdadMaxText] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(applied);
    setEdadMinText(applied.edadMin > 0 ? String(applied.edadMin) : "");
    setEdadMaxText(applied.edadMax > 0 ? String(applied.edadMax) : "");
  }, [open, applied]);

  useEffect(() => {
    document.body.classList.toggle("sayittome-filters-open", open);
    return () => {
      document.body.classList.remove("sayittome-filters-open");
    };
  }, [open]);

  const summaryLabels = useMemo(
    () => ({
      country: t("shuffle_filters_country"),
      countryName: (code: string) => getCountryByCode(code)?.name || code,
      gender: {
        todos: t("shuffle_gender_all"),
        hombre: t("shuffle_gender_male"),
        mujer: t("shuffle_gender_female"),
        otro: t("shuffle_gender_other"),
      },
      online: t("shuffle_filters_summary_online"),
      withPhoto: t("shuffle_filters_summary_photo"),
      withStories: t("shuffle_filters_summary_stories"),
      ageRange: (min: number, max: number) =>
        t("shuffle_filters_summary_age_range", { min: String(min), max: String(max) }),
      ageMin: (min: number) => t("shuffle_filters_summary_age_min", { min: String(min) }),
      ageMax: (max: number) => t("shuffle_filters_summary_age_max", { max: String(max) }),
    }),
    [t],
  );

  const currentDraft = useMemo(
    () => ({
      ...draft,
      edadMin: parseOptionalAge(edadMinText),
      edadMax: parseOptionalAge(edadMaxText),
    }),
    [draft, edadMinText, edadMaxText],
  );

  const summary = shuffleFiltersSummary(currentDraft, summaryLabels);
  const isModern = variant === "modern";

  const selectedCountry = getCountryByCode(draft.pais);
  const subdivisions = getSubdivisionsForCountry(draft.pais);

  if (!open) return null;

  function toggleInterest(interest: string) {
    setDraft((prev) => {
      const normalized = interest.trim().toLowerCase();
      const exists = prev.intereses.some((item) => item.trim().toLowerCase() === normalized);
      const next = exists
        ? prev.intereses.filter((item) => item.trim().toLowerCase() !== normalized)
        : [...prev.intereses, interest];
      return { ...prev, intereses: normalizeInterests(next) };
    });
  }

  function handleApply() {
    onApply({
      ...currentDraft,
      intereses: normalizeInterests(currentDraft.intereses),
    });
    onClose();
  }

  function handleClear() {
    const cleared = defaultShuffleFilters();
    setDraft(cleared);
    setEdadMinText("");
    setEdadMaxText("");
    onClear();
    onClose();
  }

  const fieldClass = isModern
    ? "w-full rounded-2xl border border-white/10 bg-[#111] px-4 py-3.5 text-sm font-bold text-white outline-none placeholder:text-white/35 focus:border-violet-500/50 disabled:text-white/45"
    : "w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3.5 text-sm font-bold text-white outline-none placeholder:text-white/35 focus:border-[#8C84FF]/50 disabled:text-white/45";

  const optionClass = "bg-[#111] text-white";

  const labelClass = "mb-2 block text-xs font-black tracking-wide text-white/55";

  return (
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/70 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <button type="button" className="absolute inset-0" aria-label={t("common_cancel")} onClick={onClose} />

      <section
        className={`sayittome-shuffle-filters-sheet relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden border border-white/10 bg-[#070707] text-white shadow-[0_18px_36px_rgba(0,0,0,0.55)] [color-scheme:dark] ${
          isModern ? "rounded-[28px]" : "rounded-[30px]"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full border ${
              isModern
                ? "border-violet-500/40 bg-violet-500/20 text-violet-200"
                : "border-[#8C84FF]/40 bg-[#8C84FF]/20 text-[#B9B4FF]"
            }`}
          >
            <SlidersHorizontal size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-black tracking-[-0.03em] text-white">
              {t("shuffle_filters_title")}
            </h2>
            <p className="text-[12.5px] font-bold text-white/55">{t("shuffle_filters_subtitle")}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/70 transition hover:bg-white/5"
            aria-label={t("common_cancel")}
          >
            <X size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div
            className={`rounded-[18px] border px-3.5 py-3 text-[12.6px] font-bold leading-relaxed ${
              isModern
                ? "border-violet-500/25 bg-violet-500/10 text-violet-100/80"
                : "border-[#8C84FF]/26 bg-[#111111] text-white/80"
            }`}
          >
            {summary || t("shuffle_filters_empty_hint")}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className={labelClass}>{t("shuffle_filters_show")}</label>
              <select
                value={draft.sexo}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    sexo: e.target.value as ShuffleFilters["sexo"],
                  }))
                }
                className={fieldClass}
              >
                {SHUFFLE_GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className={optionClass}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t("shuffle_filters_age_min")}</label>
                <input
                  type="number"
                  min={13}
                  max={99}
                  inputMode="numeric"
                  value={edadMinText}
                  onChange={(e) => setEdadMinText(e.target.value)}
                  placeholder={t("shuffle_filters_age_min")}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t("shuffle_filters_age_max")}</label>
                <input
                  type="number"
                  min={13}
                  max={99}
                  inputMode="numeric"
                  value={edadMaxText}
                  onChange={(e) => setEdadMaxText(e.target.value)}
                  placeholder={t("shuffle_filters_age_max")}
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>{t("shuffle_filters_country")}</label>
              <select
                value={draft.pais}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    pais: e.target.value,
                    provincia: "",
                  }))
                }
                className={fieldClass}
              >
                <option value="" className={optionClass}>
                  {t("shuffle_filters_all_countries")}
                </option>
                {SHUFFLE_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code} className={optionClass}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                {selectedCountry?.subdivisionLabel || t("shuffle_filters_province")}
              </label>
              <select
                value={draft.provincia}
                onChange={(e) => setDraft((prev) => ({ ...prev, provincia: e.target.value }))}
                disabled={!draft.pais}
                className={fieldClass}
              >
                <option value="" className={optionClass}>
                  {t("shuffle_filters_all_provinces")}
                </option>
                {subdivisions.map((item) => (
                  <option key={item} value={item} className={optionClass}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>{t("shuffle_filters_city")}</label>
              <input
                value={draft.ciudad}
                onChange={(e) => setDraft((prev) => ({ ...prev, ciudad: e.target.value }))}
                placeholder={t("shuffle_filters_city_hint")}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="mt-4">
            <ToggleRow
              variant={variant}
              title={t("shuffle_filters_solo_online")}
              subtitle={t("shuffle_filters_solo_online_desc")}
              value={draft.soloOnline}
              onChange={(soloOnline) => setDraft((prev) => ({ ...prev, soloOnline }))}
            />
            <ToggleRow
              variant={variant}
              title={t("shuffle_filters_solo_photo")}
              subtitle={t("shuffle_filters_solo_photo_desc")}
              value={draft.soloConFoto}
              onChange={(soloConFoto) => setDraft((prev) => ({ ...prev, soloConFoto }))}
            />
            <ToggleRow
              variant={variant}
              title={t("shuffle_filters_solo_stories")}
              subtitle={t("shuffle_filters_solo_stories_desc")}
              value={draft.soloConHistorias}
              onChange={(soloConHistorias) => setDraft((prev) => ({ ...prev, soloConHistorias }))}
            />
          </div>

          <div className="mt-2">
            <p className="mb-2.5 text-[15px] font-black text-white">{t("shuffle_filters_interests")}</p>
            <div className="flex flex-wrap gap-2">
              {SHUFFLE_INTEREST_OPTIONS.map((interest) => {
                const active = draft.intereses.some(
                  (item) => item.trim().toLowerCase() === interest.trim().toLowerCase(),
                );
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`rounded-full border px-3 py-2 text-[12.5px] font-black transition ${
                      active
                        ? isModern
                          ? "border-white/40 bg-violet-600 text-white"
                          : "border-white/40 bg-[#8C84FF] text-white"
                        : "border-white/10 bg-white/[0.055] text-white/85"
                    }`}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-transparent px-4 py-3.5 text-sm font-black text-white transition active:scale-[0.98]"
          >
            <Trash2 size={18} />
            {t("shuffle_filters_clear")}
          </button>
          <button
            type="button"
            onClick={handleApply}
            className={`flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-black text-white transition active:scale-[0.98] ${
              isModern ? "bg-violet-600 shadow-[0_0_24px_rgba(124,58,237,.35)]" : "bg-[#8C84FF]"
            }`}
          >
            <Check size={18} />
            {t("shuffle_filters_apply")}
          </button>
        </footer>
      </section>
    </div>
  );
}