"use client";

import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import {
  filterAdminReports,
  isFakeProfileReport,
  parseReportCreatedAtMs,
} from "@/lib/admin/reportSort";
import AdminEvidenceMedia from "@/components/admin/AdminEvidenceMedia";
import AdminUndoButton from "@/components/admin/AdminUndoButton";
import { useT } from "@/contexts/LocaleContext";
import type { MessageKey } from "@/lib/i18n/getMessage";

type ReportRow = {
  id: string;
  tipo?: string;
  motivo?: string;
  createdAt?: unknown;
  detalle?: string;
  links?: string;
  evidenceUrl?: string;
  targetUsername?: string;
  targetUid?: string;
  targetAnonId?: string;
  targetLabel?: string;
  storyId?: string;
  reporterEmail?: string;
  reporterUid?: string;
  reporterFingerprint?: string;
  reporterLabel?: string;
  chatId?: string;
  chatExcerpt?: string;
  chatTipo?: string;
  solicitanteUid?: string;
  destinatarioUid?: string;
  solicitanteUsername?: string;
  destinatarioUsername?: string;
  reportedAnonId?: string;
  reportedSolicitanteAnonId?: string;
  estado?: string;
};

const MOTIVO_KEYS: Record<string, MessageKey> = {
  perfil_falso: "report_reason_fake_profile",
  perfil: "report_reason_profile",
  historia: "report_reason_story",
  denuncia_chat_anonimo: "admin_report_reason_anon_chat",
  chat_anonimo_directo: "admin_report_reason_anon_chat",
};

function ReportChatMessages({ chatId }: { chatId: string }) {
  const t = useT();
  const [messages, setMessages] = useState<Array<{ id: string; text: string; sender: string }>>(
    [],
  );

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats_anonimos", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limit(40),
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((row) => {
          const data = row.data();
          const text = String(data.text || data.texto || data.mensaje || "").trim();
          const sender = String(data.senderId || data.remitenteId || data.autorId || "?");
          return { id: row.id, text, sender };
        }),
      );
    });

    return () => unsub();
  }, [chatId]);

  if (messages.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
        {t("admin_report_chat_messages")}
      </p>
      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {messages.map((message) => (
          <div key={message.id} className="rounded-xl bg-white/5 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-white/35">
              {message.sender.slice(0, 12)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-white/80">
              {message.text || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function useResolvedUsername(uid?: string) {
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!uid) {
      setUsername("");
      return;
    }

    let cancelled = false;

    void getDoc(doc(db, "usuarios", uid)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const data = snap.data();
      setUsername(String(data.username || data.usernameLower || ""));
    });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return username;
}

function ReportMetaLine({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  if (!value) return null;

  return (
    <p className="text-sm font-semibold text-white/60">
      <span className="font-black uppercase tracking-[0.12em] text-white/35">{label}: </span>
      {href ? (
        <Link href={href} className="text-sky-200/90 underline-offset-2 hover:underline">
          {value}
        </Link>
      ) : (
        <span className="text-white/75">{value}</span>
      )}
    </p>
  );
}

function ReportCard({
  report,
  busyId,
  emphasizeEvidence = false,
  onSetStatus,
  onRunAction,
}: {
  report: ReportRow;
  busyId: string;
  emphasizeEvidence?: boolean;
  onSetStatus: (id: string, estado: string) => Promise<void>;
  onRunAction: (report: ReportRow, action: string) => Promise<void>;
}) {
  const t = useT();
  const fallbackTargetUsername = useResolvedUsername(report.targetUid);
  const fallbackSolicitanteUsername = useResolvedUsername(report.solicitanteUid);
  const fallbackDestinatarioUsername = useResolvedUsername(report.destinatarioUid);

  const titleKey = MOTIVO_KEYS[report.motivo || ""] || MOTIVO_KEYS[report.tipo || ""];
  const title = titleKey ? t(titleKey) : report.motivo || report.tipo || t("admin_report_unknown");

  const targetUsername =
    report.targetUsername ||
    fallbackTargetUsername ||
    report.destinatarioUsername ||
    fallbackDestinatarioUsername ||
    report.solicitanteUsername ||
    fallbackSolicitanteUsername;

  const targetDisplay =
    report.targetLabel ||
    (targetUsername ? `@${targetUsername}` : "") ||
    (report.targetAnonId ? `Anónimo ${report.targetAnonId.slice(0, 10)}` : "") ||
    (report.reportedAnonId ? `Anónimo ${report.reportedAnonId.slice(0, 10)}` : "") ||
    (report.reportedSolicitanteAnonId
      ? `Anónimo ${report.reportedSolicitanteAnonId.slice(0, 10)}`
      : "") ||
    t("admin_report_unknown_target");

  const reporterDisplay =
    report.reporterLabel ||
    (report.reporterEmail ? report.reporterEmail : "") ||
    (report.reporterUid ? report.reporterUid.slice(0, 10) : "") ||
    (report.reporterFingerprint ? `Anónimo ${report.reporterFingerprint.slice(0, 10)}` : "") ||
    t("admin_report_unknown_reporter");

  const profileHref = targetUsername ? `/u/${encodeURIComponent(targetUsername)}` : undefined;
  const canModerateProfile = Boolean(report.targetUid);
  const createdLabel = parseReportCreatedAtMs(report.createdAt)
    ? new Date(parseReportCreatedAtMs(report.createdAt)).toLocaleString("es-AR")
    : "";

  return (
    <div className="rounded-2xl border border-white/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-black text-xl">{title}</p>
          <p className="mt-1 text-sm font-bold text-white/55">
            {targetDisplay} · {report.estado || "pendiente"}
          </p>
          {createdLabel ? (
            <p className="mt-1 text-xs font-semibold text-white/35">{createdLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <ReportMetaLine label={t("admin_report_reporter")} value={reporterDisplay} />
        <ReportMetaLine
          label={t("admin_report_target")}
          value={targetDisplay}
          href={profileHref}
        />
        {report.chatId ? (
          <ReportMetaLine label={t("admin_report_chat")} value={report.chatId} />
        ) : null}
        {report.storyId ? (
          <ReportMetaLine label={t("admin_report_story")} value={report.storyId} />
        ) : null}
      </div>

      <p className="mt-3 whitespace-pre-wrap font-semibold leading-relaxed text-white/75">
        {report.detalle || report.chatExcerpt || "-"}
      </p>

      {report.links ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
            {t("admin_report_links")}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-all text-sm font-semibold text-sky-200/90">
            {report.links}
          </p>
        </div>
      ) : null}

      {report.evidenceUrl ? (
        <AdminEvidenceMedia
          url={report.evidenceUrl}
          className={[
            "mt-3 block overflow-hidden rounded-xl border border-white/10",
            emphasizeEvidence ? "max-w-md" : "max-w-xs",
          ].join(" ")}
          maxHeightClass={emphasizeEvidence ? "max-h-80" : "max-h-40"}
        />
      ) : null}

      {report.chatId ? <ReportChatMessages chatId={report.chatId} /> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busyId === report.id || !canModerateProfile}
          onClick={() => void onRunAction(report, "tag_roleplay")}
          className="rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-black text-amber-100 disabled:opacity-40"
        >
          {t("admin_report_tag_roleplay")}
        </button>
        <button
          type="button"
          disabled={busyId === report.id || !canModerateProfile}
          onClick={() => void onRunAction(report, "ban_perm")}
          className="rounded-xl bg-red-500/20 px-4 py-2 text-sm font-black text-red-200 disabled:opacity-40"
        >
          {t("admin_report_block_user")}
        </button>
        {canModerateProfile ? (
          <>
            <AdminUndoButton uid={report.targetUid!} undoAction="clear_moderation_tag" />
            <AdminUndoButton uid={report.targetUid!} undoAction="unban" />
            <AdminUndoButton uid={report.targetUid!} undoAction="unblur_profile" />
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void onSetStatus(report.id, "revisado")}
          className="rounded-xl bg-green-500/20 px-4 py-2 text-sm font-black"
        >
          Revisado
        </button>
        <button
          type="button"
          onClick={() => void onSetStatus(report.id, "descartado")}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

export default function AdminReportsPanel({
  filter = "all",
}: {
  filter?: "all" | "fake_profiles";
}) {
  const t = useT();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!isAdminEmail(auth.currentUser?.email)) return;

    const q = query(collection(db, "reportes"), orderBy("createdAt", "desc"), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      setReports(
        snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as Omit<ReportRow, "id">),
        })),
      );
    });

    return () => unsub();
  }, []);

  const visibleReports = useMemo(
    () => filterAdminReports(reports, filter),
    [filter, reports],
  );

  const pendingCount = useMemo(
    () =>
      visibleReports.filter((report) => (report.estado || "pendiente") === "pendiente").length,
    [visibleReports],
  );

  async function setStatus(id: string, estado: string) {
    await updateDoc(doc(db, "reportes", id), {
      estado,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser?.email || "",
    });
  }

  async function runAdminAction(report: ReportRow, action: string) {
    if (!report.targetUid || busyId) return;

    setBusyId(report.id);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          uid: report.targetUid,
          adminEmail: auth.currentUser?.email || "",
          note: report.detalle || "",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "action_failed"));
      }

      await setStatus(report.id, action === "ban_perm" ? "bloqueado" : "revisado");
    } catch (error) {
      console.error(error);
      alert("No se pudo aplicar la acción.");
    } finally {
      setBusyId("");
    }
  }

  if (visibleReports.length === 0) {
    return (
      <p className="text-white/40 font-bold">
        {filter === "fake_profiles"
          ? "No hay denuncias de perfiles truchos."
          : "No hay reportes pendientes."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {pendingCount > 0 ? (
        <p className="text-sm font-black text-amber-100/80">
          {t("admin_report_pending_count", { count: String(pendingCount) })}
        </p>
      ) : null}

      <div className="space-y-3">
        {visibleReports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            busyId={busyId}
            emphasizeEvidence={filter === "fake_profiles" || isFakeProfileReport(report)}
            onSetStatus={setStatus}
            onRunAction={runAdminAction}
          />
        ))}
      </div>
    </div>
  );
}
