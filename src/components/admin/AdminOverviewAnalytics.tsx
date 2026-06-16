"use client";

type Props = {
  stats: Record<string, number>;
};

export default function AdminOverviewAnalytics({ stats }: Props) {
  const bars = [
    { key: "usersTotal", label: "Usuarios", color: "bg-violet-500" },
    { key: "usersOnline", label: "Online", color: "bg-green-500" },
    { key: "messagesLast24h", label: "Mensajes 24h", color: "bg-sky-400" },
    { key: "storiesActive", label: "Historias", color: "bg-pink-500" },
    { key: "reportsOpen", label: "Reportes", color: "bg-red-500" },
    { key: "growthToday", label: "Crecimiento", color: "bg-amber-400" },
  ];

  const max = Math.max(...bars.map((b) => Number(stats[b.key] || 0)), 1);

  return (
    <section className="mt-8 max-w-4xl">
      <p className="mb-4 text-lg font-black">Actividad</p>
      <div className="grid gap-4">
        {bars.map((bar) => {
          const value = Number(stats[bar.key] || 0);
          const width = Math.max(8, Math.round((value / max) * 100));

          return (
            <div key={bar.key}>
              <div className="mb-2 flex justify-between font-black">
                <span>{bar.label}</span>
                <span className="text-white/50">{value}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full ${bar.color}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
