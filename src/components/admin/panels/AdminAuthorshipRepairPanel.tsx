"use client";

import { useMemo, useState } from "react";

import { auth } from "@/lib/firebase";
import type { RepairPlan, RepairPerspective } from "@/lib/chat/historicalAuthorshipRepair";
import { exportRepairPlanWithoutPii } from "@/lib/chat/historicalAuthorshipRepair";

type ChatRow = {
  id: string;
  lastMessage?: string;
  lastMessageSenderShape?: string;
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
  const [applyResult, setApplyResult] = useState("");

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
        setApplyResult("Export sin PII copiado al portapapeles. Apply sigue congelado.");
        return;
      }
      setPlan(json.plan as RepairPlan);
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

  async function tryApply() {
    setBusy("apply");
    setApplyResult("");
    try {
      const { res, json } = await adminFetch("/api/admin/authorship-repair/apply", {
        method: "POST",
        body: JSON.stringify({ chatId, marks, perspective, reason: "ui" }),
      });
      setApplyResult(`HTTP ${res.status} writes=${json.writes ?? 0} ${json.error || ""}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5">
        <p className="text-lg font-black">Reparación histórica asistida</p>
        <p className="mt-2 text-sm font-bold text-white/70">
          Apply Firestore congelado hasta auditoría ChatGPT. Dry-run y preview only.
          No toca persistencia/hidratación de mensajes nuevos (107cae5).
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
            <label className="text-sm font-black">Perspectiva del operador</label>
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
            <button
              type="button"
              onClick={() => void preview(marks, false)}
              className="rounded-xl border border-white/20 px-3 py-2 text-sm font-black"
            >
              Recalcular preview
            </button>
            <button
              type="button"
              onClick={() => markRange(true)}
              className="rounded-xl border border-white/20 px-3 py-2 text-sm"
            >
              Bloque = mío
            </button>
            <button
              type="button"
              onClick={() => markRange(false)}
              className="rounded-xl border border-white/20 px-3 py-2 text-sm"
            >
              Bloque = la otra
            </button>
            <button
              type="button"
              onClick={() => void preview(marks, true)}
              className="rounded-xl border border-white/20 px-3 py-2 text-sm"
            >
              Export dry-run sin PII
            </button>
          </div>

          {plan ? (
            <p className="text-sm text-white/70">
              seleccionados {plan.selectedCount} · writes {plan.writeCount} · noop{" "}
              {plan.noopCount} · errores {plan.errorCount} · XOR fail{" "}
              {plan.complementaryFailures} · applyAllowed={String(plan.applyAllowed)}
            </p>
          ) : null}

          <div className="space-y-2">
            {(plan?.rows || []).map((row) => {
              const mark = markById.get(row.messageId);
              return (
                <div
                  key={row.messageId}
                  className="rounded-2xl border border-white/10 bg-black/50 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-white/60">
                    <span>{row.messageIdShort}</span>
                    <span>{row.createdAt ? row.createdAt.slice(11, 19) : "--:--"}</span>
                    <span>
                      persist {row.persisted.senderRole || "∅"} / {row.persisted.fromUid.slice(0, 18)}
                    </span>
                  </div>
                  <p className="mt-1 text-white/85">{row.textPreview || "(sin texto)"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMark(row.messageId, true)}
                      className={[
                        "rounded-lg px-3 py-1 text-xs font-black",
                        mark?.mine === true ? "bg-emerald-400 text-black" : "border border-white/20",
                      ].join(" ")}
                    >
                      mío
                    </button>
                    <button
                      type="button"
                      onClick={() => setMark(row.messageId, false)}
                      className={[
                        "rounded-lg px-3 py-1 text-xs font-black",
                        mark?.mine === false ? "bg-sky-400 text-black" : "border border-white/20",
                      ].join(" ")}
                    >
                      de la otra
                    </button>
                  </div>
                  {row.selected && row.after ? (
                    <p className="mt-2 text-xs text-amber-200">
                      before owner/visitor={String(row.before.ownerMine)}/
                      {String(row.before.visitorMine)} → after {String(row.after.ownerMine)}/
                      {String(row.after.visitorMine)}
                      {row.proposed
                        ? ` · ${row.proposed.senderRole} ${row.proposed.fromUid.slice(0, 22)}`
                        : ""}
                      {row.noop ? " · noop" : ""}
                      {row.error ? ` · ${row.error}` : ""}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-white/45">
                      now owner/visitor={String(row.before.ownerMine)}/
                      {String(row.before.visitorMine)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void tryApply()}
            className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-black text-red-200"
          >
            Intentar apply (debe devolver 423 / 0 writes)
          </button>
        </section>
      ) : null}

      {error ? <p className="text-sm font-bold text-red-300">{error}</p> : null}
      {applyResult ? <p className="text-sm font-bold text-amber-200">{applyResult}</p> : null}
      {plan && !error ? (
        <pre className="overflow-auto rounded-2xl bg-black/70 p-3 text-[11px] text-white/70">
          {JSON.stringify(exportRepairPlanWithoutPii(plan), null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
