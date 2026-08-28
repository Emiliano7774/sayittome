"use client";

import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useAdminApi } from "@/components/admin/AdminShell";
import { ADMIN_EMAIL } from "@/lib/admin/isAdmin";
import { buildUndoPayload, canUndoAdminAction } from "@/lib/admin/adminActionUndo";
import {
  compareIpTrustFingerprints,
  interpretCrossPathBaselines,
  IP_TRUST_TOPOLOGY_NOTE,
  type IpTrustProbeScenario,
} from "@/lib/abuse/abuseIpTrustProbeShared";
import { runClientDirectEchoProbe } from "@/lib/admin/p0IpTrustClientProbe";
import { useT } from "@/contexts/LocaleContext";
import { auth, db } from "@/lib/firebase";

type AdminLogRow = {
  id: string;
  timestamp?: string;
  adminEmail?: string;
  targetUid?: string;
  targetId?: string;
  accion?: string;
  action?: string;
  metadata?: string;
};

const SCENARIOS: IpTrustProbeScenario[] = [
  "baseline",
  "spoof_xff_left_public",
  "spoof_xff_client_only",
  "spoof_x_real_ip",
  "spoof_forwarded",
];

export default function AdminSystemPanel() {
  const t = useT();
  const admin = useAdminApi();
  const [logs, setLogs] = useState<AdminLogRow[]>([]);
  const [busyId, setBusyId] = useState("");
  const [ipProbeBusy, setIpProbeBusy] = useState(false);
  const [ipProbeError, setIpProbeError] = useState("");
  const [ipProbeResult, setIpProbeResult] = useState<Record<string, unknown> | null>(null);
  const [ipConfig, setIpConfig] = useState<Record<string, unknown> | null>(null);

  const runServerProbe = useCallback(async (input: { scenario?: string; runAll?: boolean }) => {
    setIpProbeBusy(true);
    setIpProbeError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("sin_auth_admin");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/p0-ip-trust-probe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok || json.ok !== true) {
        throw new Error(String(json.error || `http_${res.status}`));
      }
      return json;
    } catch (error) {
      setIpProbeError(String((error as Error)?.message || error));
      return null;
    } finally {
      setIpProbeBusy(false);
    }
  }, []);

  const runClientProbe = useCallback(async (scenario: IpTrustProbeScenario) => {
    return runClientDirectEchoProbe(scenario);
  }, []);

  const runDualPathAll = useCallback(async () => {
    setIpProbeBusy(true);
    setIpProbeError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("sin_auth_admin");
      const idToken = await user.getIdToken();

      const serverRes = await fetch("/api/admin/p0-ip-trust-probe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ runAll: true }),
      });
      const serverJson = (await serverRes.json()) as Record<string, unknown>;
      if (!serverRes.ok || serverJson.ok !== true) {
        throw new Error(String(serverJson.error || `server_http_${serverRes.status}`));
      }

      const clientResults: Record<string, unknown> = {};
      let clientBaseline = null;
      for (const scenario of SCENARIOS) {
        const row = await runClientDirectEchoProbe(scenario);
        if (scenario === "baseline") clientBaseline = row.analysis;
        clientResults[scenario] = {
          ...row,
          compare:
            clientBaseline && row.analysis && scenario !== "baseline"
              ? compareIpTrustFingerprints(clientBaseline, row.analysis)
              : null,
        };
      }

      const serverResults = (serverJson.results || {}) as Record<
        string,
        { analysis?: { selectedFingerprint?: string | null } | null }
      >;
      const serverBaseline = serverResults.baseline?.analysis || null;
      const crossPath = interpretCrossPathBaselines({
        clientBaseline,
        serverBaseline,
      });

      setIpProbeResult({
        ok: true,
        gate: "P0_IP_TRUST_DUAL_PATH",
        serverToDirectSsr: serverJson,
        browserToDirectSsr: clientResults,
        crossPathBaseline: crossPath,
        activateGates: false,
        note: "Same selected on both paths may be proxy — NOT physical PASS",
      });
    } catch (error) {
      setIpProbeError(String((error as Error)?.message || error));
      setIpProbeResult(null);
    } finally {
      setIpProbeBusy(false);
    }
  }, []);

  const runClientScenario = useCallback(
    async (scenario: IpTrustProbeScenario) => {
      setIpProbeBusy(true);
      setIpProbeError("");
      try {
        const clientRow = await runClientProbe(scenario);
        const clientBaseline =
          scenario === "baseline"
            ? clientRow.analysis
            : (await runClientProbe("baseline")).analysis;
        setIpProbeResult({
          ok: clientRow.ok,
          gate: "P0_IP_TRUST_CLIENT_PROBE",
          browserToDirectSsr: {
            ...clientRow,
            compare:
              clientBaseline && clientRow.analysis && scenario !== "baseline"
                ? compareIpTrustFingerprints(clientBaseline, clientRow.analysis)
                : null,
          },
          activateGates: false,
        });
        if (!clientRow.ok) {
          setIpProbeError(String(clientRow.error || "client_probe_failed"));
        }
      } catch (error) {
        setIpProbeError(String((error as Error)?.message || error));
        setIpProbeResult(null);
      } finally {
        setIpProbeBusy(false);
      }
    },
    [runClientProbe],
  );

  useEffect(() => {
    void (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/p0-abuse-config", {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        });
        if (res.ok) {
          setIpConfig((await res.json()) as Record<string, unknown>);
        }
      } catch {
        /* optional */
      }
    })();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "admin_logs"), orderBy("timestamp", "desc"), limit(120));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(
        snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as Omit<AdminLogRow, "id">),
        })),
      );
    });
    return () => unsub();
  }, []);

  async function revertLog(log: AdminLogRow) {
    const originalAction = String(log.accion || log.action || "");
    if (!canUndoAdminAction(originalAction) || busyId) return;
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(log.metadata || "{}") as Record<string, unknown>;
    } catch {
      metadata = {};
    }
    const payload = buildUndoPayload(originalAction, {
      ...metadata,
      uid: log.targetUid || metadata.uid,
      chatId: metadata.chatId || log.targetId,
      storyId: metadata.storyId || log.targetId,
    });
    if (!payload) return;
    setBusyId(log.id);
    try {
      const json = await admin.postAction(payload);
      if (!json?.ok) alert(t("admin_undo_fail"));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-4 rounded-3xl border border-amber-400/25 bg-amber-500/5 p-6">
        <p className="text-xl font-black">P0 — Diagnóstico IP (read-only)</p>
        <p className="text-sm font-bold text-white/55">
          Fingerprints HMAC — sin IP cruda ni secret. Gates/rules OFF.
        </p>
        <p className="text-xs font-bold text-white/40">{IP_TRUST_TOPOLOGY_NOTE}</p>
        <p className="text-xs font-bold text-amber-200/70">
          Servidor→SSR mide IP del SSR, no del celular. Usá Navegador→SSR para path real del
          cliente. Mismo selected en ambos paths puede ser proxy — NO PASS físico.
        </p>
        {ipConfig ? (
          <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-white/50">
            {JSON.stringify(ipConfig, null, 2)}
          </pre>
        ) : null}

        <p className="text-sm font-black text-white/70">Navegador → SSR directo (cliente real)</p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((scenario) => (
            <button
              key={`client-${scenario}`}
              type="button"
              disabled={ipProbeBusy}
              onClick={() => void runClientScenario(scenario)}
              className="rounded-xl border border-lime-400/30 px-3 py-2 text-xs font-black disabled:opacity-40"
            >
              Cliente: {scenario}
            </button>
          ))}
        </div>

        <p className="text-sm font-black text-white/70">Servidor → SSR directo (egress SSR)</p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((scenario) => (
            <button
              key={`server-${scenario}`}
              type="button"
              disabled={ipProbeBusy}
              onClick={async () => {
                const json = await runServerProbe({ scenario });
                if (json) setIpProbeResult(json);
              }}
              className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black disabled:opacity-40"
            >
              SSR: {scenario}
            </button>
          ))}
          <button
            type="button"
            disabled={ipProbeBusy}
            onClick={async () => {
              const json = await runServerProbe({ runAll: true });
              if (json) setIpProbeResult(json);
            }}
            className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black disabled:opacity-40"
          >
            SSR: todos
          </button>
        </div>

        <button
          type="button"
          disabled={ipProbeBusy}
          onClick={() => void runDualPathAll()}
          className="rounded-xl bg-amber-500/25 px-4 py-2 text-sm font-black text-amber-100 disabled:opacity-40"
        >
          Dual path: cliente + servidor (comparar baseline)
        </button>

        {ipProbeError ? (
          <p className="text-sm font-bold text-red-300">{ipProbeError}</p>
        ) : null}
        {ipProbeResult ? (
          <pre className="max-h-96 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-lime-200/80">
            {JSON.stringify(ipProbeResult, null, 2)}
          </pre>
        ) : null}
      </section>

      <section className="max-w-2xl space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-xl font-black">Referencia rápida</p>
        <p className="font-bold text-white/55">Email autorizado: {ADMIN_EMAIL}</p>
        <p className="font-bold text-white/55">Presencia online: ventana de 15 minutos.</p>
        <p className="font-bold text-white/55">Antiacoso default: 30 minutos por fingerprint.</p>
        <p className="font-bold text-white/55">Link verificado: /u/username?verified=1</p>
        <p className="font-bold text-white/55">
          Autoría histórica: <a className="underline" href="/admin/authorship">/admin/authorship</a>
        </p>
      </section>

      <section>
        <p className="mb-4 text-lg font-black">Logs recientes</p>
        <div className="space-y-3">
          {logs.map((log) => {
            const action = log.accion || log.action || "";
            const canUndo = canUndoAdminAction(action);
            return (
              <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{action}</p>
                    <p className="mt-1 text-sm font-bold text-white/50">
                      {log.adminEmail} → {log.targetUid || "-"} · {log.timestamp || "ahora"}
                    </p>
                  </div>
                  {canUndo ? (
                    <button
                      type="button"
                      disabled={busyId === log.id}
                      onClick={() => void revertLog(log)}
                      className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2 text-sm font-black text-sky-100 disabled:opacity-50"
                    >
                      {t("admin_undo_revert")}
                    </button>
                  ) : null}
                </div>
                {log.metadata ? (
                  <pre className="mt-2 overflow-x-auto text-xs text-white/35">{log.metadata}</pre>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
