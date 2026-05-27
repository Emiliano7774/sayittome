"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { auth } from "@/lib/firebase";
import {
  formatRegistrationDelta,
  type RegistrationDayRow,
} from "@/lib/admin/userRegistrationsByDay";

type Summary = {
  todayCount: number;
  todayDelta: number | null;
  totalWithDate: number;
  daysTracked: number;
};

type Props = {
  adminEmail?: string;
  defaultOpen?: boolean;
};

function deltaTone(delta: number | null) {
  if (delta === null) return "text-white/45";
  if (delta > 0) return "text-emerald-300";
  if (delta < 0) return "text-red-300";
  return "text-white/55";
}

function deltaBarWidth(count: number, max: number) {
  if (max <= 0) return 8;
  return Math.max(8, Math.round((count / max) * 100));
}

export default function AdminRegistrationsPanel({
  adminEmail = "",
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [days, setDays] = useState<RegistrationDayRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");
        const email = auth.currentUser?.email || adminEmail;
        const res = await fetch("/api/admin/registrations-by-day", {
          cache: "no-store",
          headers: { "x-admin-email": email },
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(String(json?.error || "Error al cargar registros"));
          return;
        }
        setDays(json.days || []);
        setSummary(json.summary || null);
      } catch {
        setError("Error al cargar registros");
      } finally {
        setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [adminEmail]);

  const maxCount = Math.max(...days.map((day) => day.count), 1);
  const todayDelta = summary?.todayDelta ?? null;

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0b]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left md:px-5 md:py-5"
      >
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
            Perfiles creados por día
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xl font-black md:text-3xl">
              Hoy: {loading ? "…" : summary?.todayCount ?? 0}
            </p>
            {!loading && todayDelta !== null ? (
              <p className={`text-sm font-black ${deltaTone(todayDelta)}`}>
                {formatRegistrationDelta(todayDelta, { today: true })}
              </p>
            ) : null}
          </div>
          {!loading && summary ? (
            <p className="mt-1 text-xs font-bold text-white/40">
              {summary.totalWithDate} usuarios con fecha · {summary.daysTracked} días registrados
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
            <p className="py-4 text-sm font-bold text-white/40">Cargando desglose diario...</p>
          ) : error ? (
            <p className="py-4 text-sm font-bold text-red-300">{error}</p>
          ) : days.length === 0 ? (
            <p className="py-4 text-sm font-bold text-white/40">Sin registros con fecha de creación.</p>
          ) : (
            <div className="space-y-2 pt-3">
              {days.map((day) => {
                const expanded = expandedDay === day.dateKey;

                return (
                  <div
                    key={day.dateKey}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-black/40"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDay((current) =>
                          current === day.dateKey ? null : day.dateKey,
                        )
                      }
                      className="flex w-full items-center gap-3 px-3 py-3 text-left md:px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black">{day.label}</p>
                          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-black">
                            {day.count}
                          </span>
                          {day.deltaVsPreviousDay !== null ? (
                            <span
                              className={`text-xs font-black ${deltaTone(day.deltaVsPreviousDay)}`}
                            >
                              {formatRegistrationDelta(day.deltaVsPreviousDay, {
                                today: day.label === "Hoy",
                              })}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-500/80"
                            style={{ width: `${deltaBarWidth(day.count, maxCount)}%` }}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-black text-white/35">
                        {expanded ? "▴" : "▾"}
                      </span>
                    </button>

                    {expanded ? (
                      <div className="border-t border-white/10 px-3 py-3 md:px-4">
                        {day.users.length === 0 ? (
                          <p className="text-xs font-bold text-white/40">Sin usuarios este día.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {day.users.map((user) => (
                              <Link
                                key={user.uid || user.username}
                                href={`/u/${encodeURIComponent(user.username)}`}
                                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-black hover:bg-white/10"
                              >
                                @{user.username}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
