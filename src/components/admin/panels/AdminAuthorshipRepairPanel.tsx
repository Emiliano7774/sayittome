"use client";

import { useMemo, useState } from "react";

import { auth } from "@/lib/firebase";
import type { RepairPlan, RepairPerspective } from "@/lib/chat/historicalAuthorshipRepair";
import { exportRepairPlanWithoutPii, markFromPerspective } from "@/lib/chat/historicalAuthorshipRepair";

type ChatRow = {
  id: string;
  lastMessage?: string;
};

type Mark = { messageId: string; mine: boolean };

async function adminFetch(url: string, init?: RequestInit) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json();
  return { res, json };
}

export default function AdminAuthorshipRepairPanel() {
  const [username, setUsername] = useState("");
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [chatId, setChatId] = useState("");
  const [perspective, setPerspective] = useState<RepairPerspective>("owner");
  const [plan, setPlan] = useState<RepairPlan | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [reason, setReason] = useState("");
  const [confirmCount, setConfirmCount] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [repairId, setRepairId] = useState("");

  const markById = useMemo(
    () => new Map(marks.map((mark) => [mark.messageId, mark])),
    [marks],
  );

  async function loadChats() {
    setBusy("chats");
    setError("");
    setPlan(null);
    try {
      const { res, json } = await adminFetch(
        `/api/admin/authorship-repair/preview?username=${encodeURIComponent(username.trim())}`,
      );
      if (!res.ok || !json.ok) throw new Error(json.error || `http_${res.status}`);
      setChats(json.chats || []);
    } catch (err) {
      setError(String((err as Error).message || err));
    } finally {
      setBusy("");
    }
  }

  async function preview(
    nextMarks = marks,
    redactPii = false,
    nextChatId = chatId,
  ) {
    if (!nextChatId) return;
    setBusy(redactPii ? "export" : "preview");
    setError("");
    try {
      const { res, json } = await adminFetch("/api/admin/authorship-repair/preview", {
        method: "POST",
        body: JSON.stringify({
          chatId: nextChatId,
          perspective,
          marks: nextMarks,
          redactPii,
        }),
      });
      if (!res.ok || !json.ok) throw new Error(json.error || `http_${res.status}`);
      if (redactPii) {
        await navigator.clipboard.writeText(JSON.stringify(json.plan, null, 2));
        setResult("Export sin PII copiado.");
        return;
      }
      setPlan(json.plan as RepairPlan);
      setReviewed(false);
      setConfirmCount("");
    } catch (err) {
      setError(String((err as Error).message || err));
    } finally {
      setBusy("");
    }
  }

  function setMark(messageId: string, mine: boolean) {
    const next = [
      ...marks.filter((mark) => mark.messageId !== messageId),
      { messageId, mine },
    ];
    setMarks(next);
    void preview(next);
  }

  function markRange(mine: boolean) {
    if (!plan) return;
    const selected = plan.rows.filter((row) => markById.has(row.messageId));
    if (selected.length < 2) return;
    const first = plan.rows.findIndex((row) => row.messageId === selected[0].messageId);
    const last = plan.rows.findIndex(
      (row) => row.messageId === selected[selected.length - 1].messageId,
    );
    const [start, end] = first < last ? [first, last] : [last, first];
    const next = [...marks];
    for (let i = start; i <= end; i += 1) {
      const id = plan.rows[i].messageId;
      const idx = next.findIndex((mark) => mark.messageId === id);
      const row = { messageId: id, mine };
      if (idx >= 0) next[idx] = row;
      else next.push(row);
    }
    setMarks(next);
    void preview(next);
  }

  function buildSelections() {
    if (!plan) return [];
    return plan.rows
      .filter((row) => row.selected)
      .map((row) => {
        const mark = markById.get(row.messageId);
        const desiredRole = mark
          ? markFromPerspective(perspective, row.messageId, mark.mine).authorRole
          : row.proposed?.senderRole;
        return {
          messageId: row.messageId,
          desiredRole,
          expectedBeforeHash: row.expectedBeforeHash,
          updateTime: row.updateTime,
        };
      });
  }

  async function applyRepair() {
    if (!plan || plan.chatBlocked || !plan.applyAllowed) return;
    if (!reviewed || Number(confirmCount) !== plan.writeCount || reason.trim().length < 8) {
      setError("Revisá el conteo, confirmá y escribí un motivo (≥8).");
      return;
    }
    setBusy("apply");
    setResult("");
    try {
      const { res, json } = await adminFetch("/api/admin/authorship-repair/apply", {
        method: "POST",
        body: JSON.stringify({
          chatId,
          perspective,
          reason: reason.trim(),
          confirmWriteCount: plan.writeCount,
          selections: buildSelections(),
        }),
      });
      setResult(JSON.stringify({
        http: res.status,
        repairId: json.repairId,
        writes: json.writes,
        error: json.error,
        applied: json.applied,
        noop: json.noop,
        rejected: json.rejected,
      }, null, 2));
      if (json.repairId) setRepairId(json.repairId);
      if (json.ok) void preview(marks, false);
    } finally {
      setBusy("");
    }
  }

  async function rollbackRepair() {
    if (!repairId.trim() || reason.trim().length < 8) {
      setError("Rollback necesita repairId y motivo (≥8).");
      return;
    }
    setBusy("rollback");
    try {
      const { res, json } = await adminFetch("/api/admin/authorship-repair/rollback", {
        method: "POST",
        body: JSON.stringify({ repairId: repairId.trim(), reason: reason.trim() }),
      });
      setResult(JSON.stringify({
        http: res.status,
        repairId: json.repairId,
        writes: json.writes,
        error: json.error,
        applied: json.applied,
        noop: json.noop,
        rejected: json.rejected,
      }, null, 2));
      if (json.ok) void preview(marks, false);
    } finally {
      setBusy("");
    }
  }

  const canApply =
    Boolean(plan?.applyAllowed) &&
    reviewed &&
    Number(confirmCount) === (plan?.writeCount || -1) &&
    reason.trim().length >= 8 &&
    !busy;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5">
        <p className="text-lg font-black">Reparación histórica asistida</p>
        <p className="mt-2 text-sm font-bold text-white/70">
          Writer habilitado. Solo selecciones explícitas, OCC por hash+updateTime,
          backup atómico. No toca 107cae5. Aplicá sólo chats que hayas revisado.
        </p>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <label className="block text-sm font-black">1. Cuenta afectada (username)</label>
        <div className="flex flex-wrap gap-2">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="min-w-[220px] flex-1 rounded-xl border border-white/15 bg-black px-3 py-2"
            placeholder="username"
          />
          <button
            type="button"
            disabled={!username.trim() || Boolean(busy)}
            onClick={() => void loadChats()}
            className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black disabled:opacity-40"
          >
            {busy === "chats" ? "Cargando…" : "Listar chats"}
          </button>
        </div>
        {chats.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-black">2. Chat</p>
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => {
                  setChatId(chat.id);
                  setMarks([]);
                  setPlan(null);
                  void preview([], false, chat.id);
                }}
                className={[
                  "block w-full rounded-xl border px-3 py-2 text-left text-sm",
                  chatId === chat.id
                    ? "border-violet-400 bg-violet-500/20"
                    : "border-white/10 bg-black/40",
                ].join(" ")}
              >
                <span className="font-mono text-xs">{chat.id.slice(-28)}</span>
                <span className="mt-1 block truncate text-white/60">
                  {chat.lastMessage || "(sin preview)"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {chatId ? (
        <section className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-wrap gap-2">
            <label className="text-sm font-black">Perspectiva</label>
            <select
              value={perspective}
              onChange={(event) => {
                setPerspective(event.target.value as RepairPerspective);
                setMarks([]);
                setPlan(null);
              }}
              className="rounded-xl border border-white/15 bg-black px-3 py-2"
            >
              <option value="owner">Soy el perfil dueño</option>
              <option value="visitor">Soy el visitante Anon</option>
            </select>
            <button type="button" onClick={() => void preview(marks, false)} className="rounded-xl border border-white/20 px-3 py-2 text-sm font-black">
              Recalcular preview
            </button>
            <button type="button" onClick={() => markRange(true)} className="rounded-xl border border-white/20 px-3 py-2 text-sm">
              Bloque = mío
            </button>
            <button type="button" onClick={() => markRange(false)} className="rounded-xl border border-white/20 px-3 py-2 text-sm">
              Bloque = la otra
            </button>
            <button type="button" onClick={() => void preview(marks, true)} className="rounded-xl border border-white/20 px-3 py-2 text-sm">
              Export sin PII
            </button>
          </div>

          {plan?.chatBlocked ? (
            <p className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">
              Chat bloqueado: {plan.blockReason}. Identidad no determinística.
            </p>
          ) : null}

          {plan ? (
            <p className="text-sm text-white/70">
              seleccionados {plan.selectedCount} · writes {plan.writeCount} · noop{" "}
              {plan.noopCount} · errores {plan.errorCount} · applyAllowed={String(plan.applyAllowed)}
            </p>
          ) : null}

          <div className="space-y-2">
            {(plan?.rows || []).map((row) => {
              const mark = markById.get(row.messageId);
              return (
                <div key={row.messageId} className="rounded-2xl border border-white/10 bg-black/50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-white/60">
                    <span>{row.messageIdShort}</span>
                    <span>{row.createdAt ? row.createdAt.slice(11, 19) : "--:--"}</span>
                    <span>persist {row.persisted.senderRole || "∅"}</span>
                  </div>
                  <p className="mt-1 text-white/85">{row.textPreview || "(sin texto)"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMark(row.messageId, true)}
                      className={mark?.mine === true ? "rounded-lg bg-emerald-400 px-3 py-1 text-xs font-black text-black" : "rounded-lg border border-white/20 px-3 py-1 text-xs font-black"}
                    >
                      mío
                    </button>
                    <button
                      type="button"
                      onClick={() => setMark(row.messageId, false)}
                      className={mark?.mine === false ? "rounded-lg bg-sky-400 px-3 py-1 text-xs font-black text-black" : "rounded-lg border border-white/20 px-3 py-1 text-xs font-black"}
                    >
                      de la otra
                    </button>
                  </div>
                  {row.selected && row.after ? (
                    <p className="mt-2 text-xs text-amber-200">
                      before {String(row.before.ownerMine)}/{String(row.before.visitorMine)} → after{" "}
                      {String(row.after.ownerMine)}/{String(row.after.visitorMine)}
                      {row.noop ? " · noop" : ""} {row.error ? ` · ${row.error}` : ""}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-white/45">
                      now {String(row.before.ownerMine)}/{String(row.before.visitorMine)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-2 rounded-2xl border border-white/15 p-4">
            <p className="text-sm font-black">Confirmar apply</p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo (≥8 caracteres)"
              className="h-20 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              Revisé before→after de las {plan?.writeCount ?? 0} escrituras
            </label>
            <input
              value={confirmCount}
              onChange={(event) => setConfirmCount(event.target.value)}
              placeholder={`Escribí el número de writes (${plan?.writeCount ?? 0})`}
              className="w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!canApply}
              onClick={() => void applyRepair()}
              className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-black disabled:opacity-40"
            >
              {busy === "apply" ? "Aplicando…" : `Apply ${plan?.writeCount ?? 0} mensajes`}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={repairId}
              onChange={(event) => setRepairId(event.target.value)}
              placeholder="repairId para rollback"
              className="min-w-[220px] flex-1 rounded-xl border border-white/15 bg-black px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!repairId.trim() || reason.trim().length < 8 || Boolean(busy)}
              onClick={() => void rollbackRepair()}
              className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-black text-red-200 disabled:opacity-40"
            >
              {busy === "rollback" ? "Rollback…" : "Rollback por repairId"}
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm font-bold text-red-300">{error}</p> : null}
      {result ? (
        <pre className="overflow-auto rounded-2xl bg-black/70 p-3 text-[11px] text-amber-100">{result}</pre>
      ) : null}
      {plan && !error ? (
        <pre className="overflow-auto rounded-2xl bg-black/70 p-3 text-[11px] text-white/70">
          {JSON.stringify(exportRepairPlanWithoutPii(plan), null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
