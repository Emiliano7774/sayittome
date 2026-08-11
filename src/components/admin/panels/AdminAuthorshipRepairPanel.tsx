"use client";

import { useMemo, useRef, useState } from "react";

import { auth } from "@/lib/firebase";
import type { RepairPlan, RepairPerspective } from "@/lib/chat/historicalAuthorshipRepair";
import { exportRepairPlanWithoutPii, markFromPerspective } from "@/lib/chat/historicalAuthorshipRepair";

type ChatRow = {
  id: string;
  lastMessage?: string;
};

type Mark = { messageId: string; mine: boolean; collectionPath?: string; selectedAnonId?: string };

function markKey(row: { messageId?: string; collectionPath?: string }) {
  return String(row.collectionPath || "").trim() || String(row.messageId || "");
}

async function adminFetch(url: string, init?: RequestInit) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      "x-request-id": requestId,
      ...(init?.headers || {}),
    },
  });
  const json = await res.json();
  return { res, json, requestId };
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
  const [previewId, setPreviewId] = useState("");
  const [previewHash, setPreviewHash] = useState("");
  const [sealedPreview, setSealedPreview] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRequestIdRef = useRef(0);

  const markByKey = useMemo(
    () => new Map(marks.map((mark) => [markKey(mark), mark])),
    [marks],
  );
  const busyGenRef = useRef(0);

  async function loadChats() {
    const gen = busyGenRef.current + 1;
    busyGenRef.current = gen;
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
      if (busyGenRef.current === gen) setBusy("");
    }
  }

  async function preview(
    nextMarks = marks,
    redactPii = false,
    nextChatId = chatId,
  ) {
    if (!nextChatId) return;
    const gen = busyGenRef.current + 1;
    busyGenRef.current = gen;
    setBusy(redactPii ? "export" : "preview");
    setError("");
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    try {
      const { res, json } = await adminFetch("/api/admin/authorship-repair/preview", {
        method: "POST",
        signal: ac.signal,
        body: JSON.stringify({
          chatId: nextChatId,
          perspective,
          marks: nextMarks,
          redactPii,
          previewRequestId: requestId,
        }),
      });
      if (requestId !== previewRequestIdRef.current) return;
      if (!res.ok || !json.ok) throw new Error(json.error || `http_${res.status}`);
      if (redactPii) {
        await navigator.clipboard.writeText(JSON.stringify(json.plan, null, 2));
        setResult("Export sin PII copiado.");
        return;
      }
      setPlan(json.plan as RepairPlan);
      setPreviewId(String(json.previewId || ""));
      setPreviewHash(String(json.previewHash || ""));
      setSealedPreview(json.sealedPreview || null);
      setReviewed(false);
      setConfirmCount("");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      if (requestId !== previewRequestIdRef.current) return;
      setError(String((err as Error).message || err));
    } finally {
      if (requestId === previewRequestIdRef.current && busyGenRef.current === gen) {
        setBusy("");
      }
    }
  }

  function setMark(
    messageId: string,
    mine: boolean,
    extras?: { collectionPath?: string; selectedAnonId?: string },
  ) {
    const key = markKey({ messageId, collectionPath: extras?.collectionPath });
    const next = [
      ...marks.filter((mark) => markKey(mark) !== key),
      {
        messageId,
        mine,
        collectionPath: extras?.collectionPath,
        selectedAnonId: extras?.selectedAnonId,
      },
    ];
    setMarks(next);
    void preview(next);
  }

  function markRange(mine: boolean) {
    if (!plan) return;
    const selected = plan.rows.filter((row) => markByKey.has(markKey(row)));
    if (selected.length < 2) return;
    const first = plan.rows.findIndex((row) => markKey(row) === markKey(selected[0]));
    const last = plan.rows.findIndex(
      (row) => markKey(row) === markKey(selected[selected.length - 1]),
    );
    const [start, end] = first < last ? [first, last] : [last, first];
    const next = [...marks];
    for (let i = start; i <= end; i += 1) {
      const row = plan.rows[i];
      const item = {
        messageId: row.messageId,
        mine,
        collectionPath: row.collectionPath,
        selectedAnonId: plan.identities.threadAnonId,
      };
      const idx = next.findIndex((mark) => markKey(mark) === markKey(row));
      if (idx >= 0) next[idx] = item;
      else next.push(item);
    }
    setMarks(next);
    void preview(next);
  }

  function buildSelections() {
    if (!plan) return [];
    return plan.rows
      .filter((row) => row.selected)
      .map((row) => {
        const mark = markByKey.get(markKey(row));
        const desiredRole = mark
          ? markFromPerspective(perspective, row.messageId, mark.mine, {
              collectionPath: row.collectionPath,
              selectedAnonId: mark.selectedAnonId || plan.identities.threadAnonId,
            }).authorRole
          : row.proposed?.senderRole;
        return {
          messageId: row.messageId,
          desiredRole,
          expectedBeforeHash: row.expectedBeforeHash,
          updateTime: row.updateTime,
          collectionName: row.collectionName,
          collectionPath: row.collectionPath,
          selectedAnonId: mark?.selectedAnonId || plan.identities.threadAnonId,
        };
      });
  }

  async function applyRepair() {
    if (!plan || plan.chatBlocked || !plan.applyAllowed) return;
    if (!reviewed || Number(confirmCount) !== plan.writeCount || reason.trim().length < 8) {
      setError("Revisá el conteo, confirmá y escribí un motivo (≥8).");
      return;
    }
    const gen = busyGenRef.current + 1;
    busyGenRef.current = gen;
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
          previewId,
          previewHash,
          sealedPreview,
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
      if (busyGenRef.current === gen) setBusy("");
    }
  }

  async function rollbackRepair() {
    if (!repairId.trim() || reason.trim().length < 8) {
      setError("Rollback necesita repairId y motivo (≥8).");
      return;
    }
    const gen = busyGenRef.current + 1;
    busyGenRef.current = gen;
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
      if (busyGenRef.current === gen) setBusy("");
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
          Apply/rollback congelados (APPLY_FROZEN). Preview y export sin PII
          siguen disponibles. No toca 107cae5.
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
                abortRef.current?.abort();
                previewRequestIdRef.current += 1;
                busyGenRef.current += 1;
                setPerspective(event.target.value as RepairPerspective);
                setMarks([]);
                setPlan(null);
                setPreviewId("");
                setPreviewHash("");
                setSealedPreview(null);
                setReviewed(false);
                setBusy("");
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
              const mark = markByKey.get(markKey(row));
              return (
                <div key={markKey(row)} className="rounded-2xl border border-white/10 bg-black/50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-white/60">
                    <span>{row.messageIdShort}</span>
                    <span>{row.createdAt ? row.createdAt.slice(11, 19) : "--:--"}</span>
                    <span>persist {row.persisted.senderRole || "∅"}</span>
                  </div>
                  <p className="mt-1 text-white/85">{row.textPreview || "(sin texto)"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setMark(row.messageId, true, {
                          collectionPath: row.collectionPath,
                          selectedAnonId: plan?.identities.threadAnonId,
                        })
                      }
                      className={mark?.mine === true ? "rounded-lg bg-emerald-400 px-3 py-1 text-xs font-black text-black" : "rounded-lg border border-white/20 px-3 py-1 text-xs font-black"}
                    >
                      mío
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMark(row.messageId, false, {
                          collectionPath: row.collectionPath,
                          selectedAnonId: plan?.identities.threadAnonId,
                        })
                      }
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
