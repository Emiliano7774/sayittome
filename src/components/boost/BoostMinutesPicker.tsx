"use client";

import { useLocale } from "@/contexts/LocaleContext";
import { BOOST_MIN_MINUTES, BOOST_MINUTES_PER_ACTIVATION } from "@/lib/boost/constants";

type Props = {
  credits: number;
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
};

export function clampBoostMinutes(credits: number, value: number) {
  if (credits < BOOST_MIN_MINUTES) return BOOST_MIN_MINUTES;
  return Math.min(Math.max(BOOST_MIN_MINUTES, Math.floor(value)), credits);
}

export function defaultBoostMinutes(credits: number) {
  if (credits < BOOST_MIN_MINUTES) return BOOST_MIN_MINUTES;
  return clampBoostMinutes(credits, Math.min(BOOST_MINUTES_PER_ACTIVATION, credits));
}

export default function BoostMinutesPicker({ credits, value, onChange, disabled = false }: Props) {
  const { t } = useLocale();

  if (credits < BOOST_MIN_MINUTES) return null;

  const presets = [20, 30, 60, 120].filter((m) => m <= credits);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-white/45">
            {t("boost_minutes_picker_label")}
          </p>
          <p className="mt-1 text-sm font-semibold text-white/55">{t("boost_minutes_picker_hint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={BOOST_MIN_MINUTES}
            max={credits}
            step={1}
            value={value}
            disabled={disabled}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onChange(clampBoostMinutes(credits, next));
            }}
            className="w-[4.5rem] rounded-xl border border-orange-500/35 bg-black/50 px-2 py-2 text-center text-lg font-black text-orange-200 outline-none"
          />
          <span className="pb-2 text-sm font-bold text-white/45">{t("boost_minutes_short")}</span>
        </div>
      </div>

      <input
        type="range"
        min={BOOST_MIN_MINUTES}
        max={credits}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clampBoostMinutes(credits, Number(event.target.value)))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500 disabled:opacity-40"
      />

      <div className="flex items-center justify-between text-xs font-bold text-white/35">
        <span>{BOOST_MIN_MINUTES} min</span>
        <span>{credits} min</span>
      </div>

      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-black transition",
                value === preset
                  ? "bg-orange-500 text-black"
                  : "border border-white/12 bg-white/[0.04] text-white/70",
              ].join(" ")}
            >
              {preset} min
            </button>
          ))}
          {credits > BOOST_MIN_MINUTES && !presets.includes(credits) ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(credits)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-black transition",
                value === credits
                  ? "bg-orange-500 text-black"
                  : "border border-white/12 bg-white/[0.04] text-white/70",
              ].join(" ")}
            >
              {t("boost_minutes_picker_all", { minutes: String(credits) })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
