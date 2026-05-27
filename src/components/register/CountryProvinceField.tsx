"use client";

import {
  getCountryByCode,
  getSubdivisionsForCountry,
  SHUFFLE_COUNTRIES,
} from "@/lib/geo/countries";
import { useT } from "@/contexts/LocaleContext";

type CountryProvinceFieldProps = {
  pais: string;
  provincia: string;
  mostrarProvincia: boolean;
  onPaisChange: (value: string) => void;
  onProvinciaChange: (value: string) => void;
  onMostrarProvinciaChange: (value: boolean) => void;
  variant?: "classic" | "modern";
};

export default function CountryProvinceField({
  pais,
  provincia,
  mostrarProvincia,
  onPaisChange,
  onProvinciaChange,
  onMostrarProvinciaChange,
  variant = "classic",
}: CountryProvinceFieldProps) {
  const t = useT();
  const isModern = variant === "modern";
  const selectedCountry = getCountryByCode(pais);
  const subdivisions = getSubdivisionsForCountry(pais);

  const selectClass = isModern
    ? "w-full rounded-2xl border border-fuchsia-500/20 bg-zinc-950 px-4 py-4 text-white outline-none"
    : "w-full bg-black border-b border-white/70 py-3 text-2xl outline-none text-white";

  return (
    <div className={isModern ? "space-y-4" : "border-b border-white/18 pb-8 mb-8"}>
      <label className="block">
        <p
          className={
            isModern
              ? "mb-3 text-sm font-semibold text-zinc-400"
              : "text-white/55 text-sm font-black uppercase tracking-wide mb-4"
          }
        >
          {t("country_label")}
        </p>
        <select
          value={pais}
          onChange={(e) => {
            onPaisChange(e.target.value);
            onProvinciaChange("");
          }}
          className={selectClass}
        >
          <option value="">{t("country_select")}</option>
          {SHUFFLE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <p
          className={
            isModern
              ? "mb-3 text-sm font-semibold text-zinc-400"
              : "text-white/55 text-sm font-black uppercase tracking-wide mb-4"
          }
        >
          {selectedCountry?.subdivisionLabel || t("province_label")}
        </p>
        <select
          value={provincia}
          onChange={(e) => onProvinciaChange(e.target.value)}
          disabled={!pais}
          className={selectClass}
        >
          <option value="">{t("province_select")}</option>
          {subdivisions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <div
        className={
          isModern
            ? "rounded-2xl border border-fuchsia-500/15 bg-fuchsia-500/5 p-4"
            : "mt-5"
        }
      >
        <p className={isModern ? "text-sm leading-6 text-zinc-400" : "text-white/35"}>
          {t("province_hint")}
        </p>

        <div
          className={
            isModern
              ? "mt-4 flex items-center justify-between gap-4"
              : "mt-5 flex items-center justify-between gap-4"
          }
        >
          <p className={isModern ? "text-sm text-zinc-500" : "text-white/35"}>
            {t("province_show")}
          </p>

          <button
            type="button"
            onClick={() => onMostrarProvinciaChange(!mostrarProvincia)}
            className={
              isModern
                ? `rounded-full px-5 py-3 text-sm font-semibold ${
                    mostrarProvincia
                      ? "bg-fuchsia-500 text-white"
                      : "bg-white/10 text-white/45"
                  }`
                : `px-5 py-3 rounded-full font-black ${
                    mostrarProvincia
                      ? "bg-white text-black"
                      : "bg-white/10 text-white/45"
                  }`
            }
          >
            {mostrarProvincia ? t("province_visible") : t("province_hidden")}
          </button>
        </div>
      </div>
    </div>
  );
}
