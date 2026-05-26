"use client";

import { ARGENTINA_PROVINCIAS } from "@/lib/profile/provincias";

type ProvinceFieldProps = {
  provincia: string;
  mostrarProvincia: boolean;
  onProvinciaChange: (value: string) => void;
  onMostrarProvinciaChange: (value: boolean) => void;
  variant?: "classic" | "modern";
};

export default function ProvinceField({
  provincia,
  mostrarProvincia,
  onProvinciaChange,
  onMostrarProvinciaChange,
  variant = "classic",
}: ProvinceFieldProps) {
  const isModern = variant === "modern";

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
          Provincia
        </p>

        <select
          value={provincia}
          onChange={(e) => onProvinciaChange(e.target.value)}
          className={
            isModern
              ? "w-full rounded-2xl border border-fuchsia-500/20 bg-zinc-950 px-4 py-4 text-white outline-none"
              : "w-full bg-black border-b border-white/70 py-3 text-2xl outline-none text-white"
          }
        >
          <option value="">Seleccionar provincia</option>
          {ARGENTINA_PROVINCIAS.map((p) => (
            <option key={p} value={p}>
              {p}
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
          Tu provincia siempre se usa para conectarte con gente de provincias cercanas,
          aunque elijas no mostrarla en el perfil. Podés cambiarla cuando quieras desde
          Editar perfil.
        </p>

        <div
          className={
            isModern
              ? "mt-4 flex items-center justify-between gap-4"
              : "mt-5 flex items-center justify-between gap-4"
          }
        >
          <p className={isModern ? "text-sm text-zinc-500" : "text-white/35"}>
            Mostrar en el perfil
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
            {mostrarProvincia ? "Visible" : "Oculta"}
          </button>
        </div>
      </div>
    </div>
  );
}
