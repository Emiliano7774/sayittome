"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchAdminJson } from "@/lib/admin/fetchAdminJson";
import { formatUsageDuration } from "@/lib/usage/appUsage";

type UsageSummary = {
  entries: number;
  registered: number;
  anonymous: number;
  sessions: number;
  totalVisibleMs: number;
  averageVisibleMs: number;
};

type UsagePerson = {
  username: string;
  enteredAt: string;
  lastSeenAt: string;
  visibleMs: number;
  sessions: number;
  measured?: boolean;
};

type UsageDay = UsageSummary & { day: string };

type UsageResponse = {
  ok?: boolean;
  error?: string;
  timezone?: string;
  today?: string;
  selectedDay?: string;
  generatedAt?: string;
  summary?: UsageSummary;
  people?: UsagePerson[];
  days?: UsageDay[];
};

function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(day: string) {
  const [year, month, date] = day.split("-");
  if (!year || !month || !date) return day;
  return `${date}/${month}`;
}

function isHereNow(iso: string) {
  const at = Date.parse(iso);
  return Number.isFinite(at) && Date.now() - at < 75_000;
}

export default function AdminUsagePanel() {
  const [selectedDay, setSelectedDay] = useState("");
  const [payload, setPayload] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const path = selectedDay
          ? `/api/admin/usage?day=${encodeURIComponent(selectedDay)}`
          : "/api/admin/usage";
        const json = await fetchAdminJson<UsageResponse>(path);
        if (cancelled) return;
        if (!json?.ok) {
          setError(String(json?.error || "No se pudo cargar el uso"));
          setPayload(null);
          return;
        }
        setError("");
        setPayload(json);
      } catch {
        if (!cancelled) setError("No se pudo cargar el uso");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const current = payloadRef.current;
    if (!current || (selectedDay && current.selectedDay && selectedDay !== current.selectedDay)) {
      setLoading(true);
    }
    void load();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 5_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedDay]);

  const summary = payload?.summary;
  const dayMismatch = Boolean(
    selectedDay && payload?.selectedDay && selectedDay !== payload.selectedDay,
  );
  const days = payload?.days || [];
  const maxEntries = Math.max(...days.map((day) => day.entries), 1);
  const activeDay = payload?.selectedDay || payload?.today || "";
  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = payload?.people || [];
    if (!needle) return rows;
    return rows.filter((person) => person.username.toLowerCase().includes(needle));
  }, [payload?.people, query]);

  const cards = summary
    ? [
        { label: "Entraron", value: String(summary.entries) },
        { label: "Con perfil", value: String(summary.registered) },
        { label: "Anónimos", value: String(summary.anonymous) },
        { label: "Tiempo promedio", value: formatUsageDuration(summary.averageVisibleMs) },
        { label: "Tiempo total", value: formatUsageDuration(summary.totalVisibleMs) },
        { label: "Sesiones", value: String(summary.sessions) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm font-bold leading-6 text-white/55">
        Este día se actualiza solo, cada pocos segundos. El tiempo es el que la app midió con la
        pantalla abierta. Los días anteriores salen de altas, última conexión, historias publicadas,
        mensajes enviados y seguimientos. Un retoque interno del perfil no cuenta como entrada.
        Horario de Argentina.
        {payload?.generatedAt ? ` Actualizado ${formatClock(payload.generatedAt)}.` : ""}
      </p>

      {error ? <p className="font-black text-red-300">{error}</p> : null}
      {loading && (!payload || dayMismatch) ? (
        <p className="text-2xl font-black text-white/40">Cargando actividad...</p>
      ) : null}

      {summary && !dayMismatch ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/20 to-black p-5"
            >
              <p className="font-bold text-white/55">{card.label}</p>
              <p className="mt-2 text-3xl font-black tracking-tight">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {days.length > 0 && !dayMismatch ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-4 font-black">Entradas por día</p>
          <div className="flex items-end gap-1 overflow-x-auto pb-2">
            {days.map((day) => {
              const height = Math.max(8, Math.round((day.entries / maxEntries) * 96));
              const selected = day.day === activeDay;
              return (
                <button
                  key={day.day}
                  type="button"
                  onClick={() => setSelectedDay(day.day)}
                  className="flex w-10 shrink-0 flex-col items-center gap-2"
                >
                  <span className="text-xs font-black text-white/70">{day.entries}</span>
                  <span
                    className={[
                      "w-8 rounded-t-lg",
                      selected ? "bg-violet-300" : "bg-violet-500/50",
                    ].join(" ")}
                    style={{ height }}
                  />
                  <span className="text-[10px] font-bold text-white/45">{formatDayLabel(day.day)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {!dayMismatch ? (
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-black">Quiénes entraron</p>
            <p className="text-sm font-bold text-white/45">{formatDayLabel(activeDay) || "hoy"}</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar usuario"
            className="w-full rounded-full border border-white/10 bg-black px-4 py-2 text-sm font-bold outline-none placeholder:text-white/30 sm:w-56"
          />
        </div>

        {people.length === 0 ? (
          <p className="py-8 text-center font-bold text-white/40">
            Todavía no hay perfiles con actividad en este día.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-white/40">
                <tr>
                  <th className="px-2 py-2 font-black">Usuario</th>
                  <th className="px-2 py-2 font-black">Entró</th>
                  <th className="px-2 py-2 font-black">Última vez</th>
                  <th className="px-2 py-2 font-black">Tiempo</th>
                  <th className="px-2 py-2 font-black">Sesiones</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person, index) => (
                  <tr
                    key={`${person.username}-${person.enteredAt}-${index}`}
                    className="border-t border-white/10"
                  >
                    <td className="px-2 py-3 font-black">
                      {person.username ? (
                        <a className="hover:text-violet-200" href={`/u/${encodeURIComponent(person.username)}`}>
                          {person.username}
                        </a>
                      ) : (
                        "Sin nombre"
                      )}
                      {isHereNow(person.lastSeenAt) ? (
                        <span className="ml-2 text-xs font-black text-emerald-300">en línea</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 font-bold text-white/70">{formatClock(person.enteredAt)}</td>
                    <td className="px-2 py-3 font-bold text-white/70">{formatClock(person.lastSeenAt)}</td>
                    <td className="px-2 py-3 font-bold">
                      {person.measured ? formatUsageDuration(person.visibleMs) : "—"}
                    </td>
                    <td className="px-2 py-3 font-bold">{person.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}
