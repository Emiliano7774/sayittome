"use client";

import { useEffect, useState } from "react";

import {
  bucketCount,
  GENDER_BUCKET_LABELS,
  type GenderBucket,
  type GenderRatioSummary,
} from "@/lib/admin/userGenderRatio";
import { auth } from "@/lib/firebase";

type Props = {
  adminEmail?: string;
  defaultOpen?: boolean;
};

function barWidth(value: number, max: number) {
  if (max <= 0) return 8;
  return Math.max(8, Math.round((value / max) * 100));
}

export default function AdminGenderRatioPanel({
  adminEmail = "",
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [summary, setSummary] = useState<GenderRatioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");
        const email = auth.currentUser?.email || adminEmail;
        const res = await fetch("/api/admin/gender-ratio", {
          cache: "no-store",
          headers: { "x-admin-email": email },
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(String(json?.error || "Error al cargar proporción de género"));
          return;
        }
        setSummary(json.summary || null);
      } catch {
        setError("Error al cargar proporción de género");
      } finally {
        setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [adminEmail]);

  const buckets: GenderBucket[] = ["hombre", "mujer", "otro", "sin_dato"];
  const maxCount = Math.max(
    ...buckets.map((key) => (summary ? bucketCount(summary, key) : 0)),
    1,
  );

  const ratioDetail =
    summary && summary.genderedTotal > 0
      ? summary.womenPerMan !== null
        ? `${summary.womenPerMan} mujeres por cada hombre`
        : summary.menPerWoman !== null
          ? `${summary.menPerWoman} hombres por cada mujer`
          : ""
      : "";

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0b]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left md:px-5 md:py-5"
      >
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
            Proporción de género
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xl font-black md:text-3xl">
              {loading ? "…" : summary?.ratioLabel ?? "—"}
            </p>
          </div>
          {!loading && summary ? (
            <p className="mt-1 text-xs font-bold text-white/40">
              {summary.hombre} hombres · {summary.mujer} mujeres
              {summary.otro > 0 ? ` · ${summary.otro} otros` : ""}
              {summary.sinDato > 0 ? ` · ${summary.sinDato} sin dato` : ""}
              {ratioDetail ? ` · ${ratioDetail}` : ""}
            </p>
          ) : null}
        </div>

        <span
          className={[
            "shrink-0 text-2xl font-black text-white/35 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="border-t border-white/10 px-4 pb-4 md:px-5 md:pb-5">
          {loading ? (
            <p className="py-4 text-sm font-bold text-white/40">Calculando perfiles...</p>
          ) : error ? (
            <p className="py-4 text-sm font-bold text-red-300">{error}</p>
          ) : !summary || summary.total <= 0 ? (
            <p className="py-4 text-sm font-bold text-white/40">Sin perfiles públicos para analizar.</p>
          ) : (
            <div className="space-y-3 pt-3">
              {buckets.map((bucket) => {
                const count = bucketCount(summary, bucket);
                const meta = GENDER_BUCKET_LABELS[bucket];

                return (
                  <div key={bucket}>
                    <div className="mb-2 flex items-center justify-between gap-3 font-black">
                      <span>{meta.label}</span>
                      <span className="text-white/50">
                        {count} · {summary.percentages[bucket]}%
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${meta.barClass}`}
                        style={{ width: `${barWidth(count, maxCount)}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {summary.genderedTotal > 0 ? (
                <p className="pt-2 text-xs font-bold text-white/35">
                  Proporción calculada sobre {summary.genderedTotal} perfiles con hombre o mujer
                  {summary.total > summary.genderedTotal
                    ? ` (${summary.total} perfiles públicos en total)`
                    : ""}
                  .
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
