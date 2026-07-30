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

import AdminEvidenceMedia from "@/components/admin/AdminEvidenceMedia";
import AdminUndoButton from "@/components/admin/AdminUndoButton";
import { auth, db } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { postAdminAction } from "@/lib/admin/postAdminAction";
import { parseReportCreatedAtMs, sortReportsNewestFirst } from "@/lib/admin/reportSort";
import { useT } from "@/contexts/LocaleContext";

type ClaimRow = {
  id: string;
  uid?: string;
  username?: string;
  reporterEmail?: string;
  mensaje?: string;
  evidenceUrl?: string;
  evidenceKind?: string;
  moderationTag?: string;
  estado?: string;
  adminReply?: string;
  adminRepliedAt?: unknown;
  adminRepliedBy?: string;
  createdAt?: unknown;
};

type ProfileSnapshot = {
  username: string;
  email: string;
  photo: string;
  bio: string;
  provincia: string;
  moderationTag: string;
  moderationTagNote: string;
  banned: boolean;
  blur: boolean;
  shadowban: boolean;
};

function useClaimProfile(uid?: string) {
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    void getDoc(doc(db, "usuarios", uid)).then((snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        setProfile(null);
        return;
      }

      const data = snap.data();
      setProfile({
        username: String(data.username || data.usernameLower || ""),
        email: String(data.email || ""),
        photo: String(data.fotoPrincipal || data.photoURL || ""),
        bio: String(data.bio || data.descripcion || ""),
        provincia: String(data.provincia || ""),
        moderationTag: String(data.moderationTag || ""),
        moderationTagNote: String(data.moderationTagNote || ""),
        banned: data.banned === true || data.suspendido === true,
        blur: data.adminBlurProfilePhoto === true || data.adminBlurFotosPerfil === true,
        shadowban: data.shadowban === true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return profile;
}

function ClaimProfileCard({
  uid,
  fallbackUsername,
  fallbackEmail,
}: {
  uid?: string;
  fallbackUsername?: string;
  fallbackEmail?: string;
}) {
  const t = useT();
  const profile = useClaimProfile(uid);

  const username = profile?.username || fallbackUsername || "";
  const email = profile?.email || fallbackEmail || "";
  const profileHref = username ? `/u/${encodeURIComponent(username)}` : undefined;

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
        {t("admin_claim_profile_title")}
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {profile?.photo ? (
            <img src={profile.photo} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-1 text-sm font-semibold text-white/70">
          <p className="font-black text-lg text-white">
            {username ? `@${username}` : uid || "-"}
          </p>
          {email ? (
            <p>
              <span className="font-black uppercase tracking-[0.12em] text-white/35">
                {t("admin_appeal_reporter")}:{" "}
              </span>
              <span className="text-white/80">{email}</span>
            </p>
          ) : null}
          {uid ? (
            <p>
              <span className="font-black uppercase tracking-[0.12em] text-white/35">UID: </span>
              <span className="break-all text-white/75">{uid}</span>
            </p>
          ) : null}
          {profile?.provincia ? (
            <p>
              <span className="font-black uppercase tracking-[0.12em] text-white/35">
                {t("admin_claim_province")}:{" "}
              </span>
              <span className="text-white/75">{profile.provincia}</span>
            </p>
          ) : null}
          {profile?.moderationTag ? (
            <p>
              <span className="font-black uppercase tracking-[0.12em] text-white/35">
                {t("admin_claim_moderation_tag")}:{" "}
              </span>
              <span className="text-amber-200">{profile.moderationTag}</span>
              {profile.moderationTagNote ? (
                <span className="text-white/45"> · {profile.moderationTagNote}</span>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {profile?.banned ? (
              <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-black text-red-200">
                {t("admin_claim_banned")}
              </span>
            ) : null}
            {profile?.blur ? (
              <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-black text-violet-200">
                {t("admin_claim_blur")}
              </span>
            ) : null}
            {profile?.shadowban ? (
              <span className="rounded-full bg-zinc-500/30 px-2.5 py-1 text-xs font-black text-white/70">
                {t("admin_claim_shadowban")}
              </span>
            ) : null}
          </div>
          {profile?.bio ? (
            <p className="pt-2 text-sm leading-relaxed text-white/55">
              <span className="font-black uppercase tracking-[0.12em] text-white/35">
                {t("admin_claim_bio")}:{" "}
              </span>
              {profile.bio}
            </p>
          ) : null}
        </div>

        {profileHref ? (
          <Link
            href={profileHref}
            className="shrink-0 rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2 text-sm font-black text-sky-100"
          >
            {t("admin_appeal_open_profile")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminGeneralClaimsPanel() {
  const t = useT();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState("");
  const [replyErrorId, setReplyErrorId] = useState("");

  useEffect(() => {
    if (!isAdminEmail(auth.currentUser?.email)) return;

    const q = query(collection(db, "reclamos_perfil_rol"), orderBy("createdAt", "desc"), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      setClaims(
        snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as Omit<ClaimRow, "id">),
        })),
      );
    });

    return () => unsub();
  }, []);

  const visibleClaims = useMemo(() => sortReportsNewestFirst(claims), [claims]);

  const pendingCount = useMemo(
    () =>
      visibleClaims.filter((claim) => (claim.estado || "pendiente") === "pendiente").length,
    [visibleClaims],
  );

  async function setStatus(id: string, estado: string) {
    await updateDoc(doc(db, "reclamos_perfil_rol", id), {
      estado,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser?.email || "",
    });
  }

  async function sendReply(claim: ClaimRow) {
    const replyText = String(replyDrafts[claim.id] || "").trim();
    if (!replyText || replyBusyId) return;

    setReplyBusyId(claim.id);
    setReplyErrorId("");
    try {
      const email = auth.currentUser?.email || "";
      const json = await postAdminAction(email, {
        action: "reply_general_claim",
        claimId: claim.id,
        uid: claim.uid || "",
        replyText,
      });
      if (!json?.ok) {
        throw new Error(String(json?.error || "reply_failed"));
      }
      setReplyDrafts((prev) => ({ ...prev, [claim.id]: "" }));
    } catch {
      setReplyErrorId(claim.id);
    } finally {
      setReplyBusyId("");
    }
  }

  if (visibleClaims.length === 0) {
    return <p className="text-white/40 font-bold">{t("admin_claim_empty")}</p>;
  }

  return (
    <div className="space-y-4">
      {pendingCount > 0 ? (
        <p className="text-sm font-black text-sky-100/80">
          {t("admin_claim_pending_count", { count: String(pendingCount) })}
        </p>
      ) : null}

      <div className="space-y-3">
        {visibleClaims.map((claim) => {
          const username = String(claim.username || "");
          const createdLabel = parseReportCreatedAtMs(claim.createdAt)
            ? new Date(parseReportCreatedAtMs(claim.createdAt)).toLocaleString("es-AR")
            : "";
          const existingReply = String(claim.adminReply || "").trim();

          return (
            <div key={claim.id} className="rounded-2xl border border-white/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-xl">{t("admin_claim_title")}</p>
                  <p className="mt-1 text-sm font-bold text-white/55">
                    {username ? `@${username}` : claim.uid || "-"} · {claim.estado || "pendiente"}
                  </p>
                  {createdLabel ? (
                    <p className="mt-1 text-xs font-semibold text-white/35">{createdLabel}</p>
                  ) : null}
                </div>
              </div>

              <ClaimProfileCard
                uid={claim.uid}
                fallbackUsername={username}
                fallbackEmail={claim.reporterEmail}
              />

              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                  {t("admin_claim_message_label")}
                </p>
                <p className="mt-2 whitespace-pre-wrap font-semibold leading-relaxed text-white/75">
                  {claim.mensaje || "-"}
                </p>
              </div>

              {claim.evidenceUrl ? (
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                    {t("admin_appeal_photo")}
                  </p>
                  <AdminEvidenceMedia url={claim.evidenceUrl} />
                </div>
              ) : null}

              {existingReply ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/70">
                    {t("admin_claim_reply_sent_label")}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-emerald-50">
                    {existingReply}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                  {t("admin_claim_reply_label")}
                </p>
                <textarea
                  value={replyDrafts[claim.id] || ""}
                  onChange={(event) =>
                    setReplyDrafts((prev) => ({
                      ...prev,
                      [claim.id]: event.target.value.slice(0, 2000),
                    }))
                  }
                  rows={3}
                  placeholder={t("admin_claim_reply_placeholder")}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold text-white outline-none"
                />
                {replyErrorId === claim.id ? (
                  <p className="text-xs font-bold text-red-300">{t("admin_claim_reply_fail")}</p>
                ) : null}
                <button
                  type="button"
                  disabled={
                    replyBusyId === claim.id ||
                    !String(replyDrafts[claim.id] || "").trim()
                  }
                  onClick={() => void sendReply(claim)}
                  className="rounded-xl bg-sky-500/25 px-4 py-2 text-sm font-black text-sky-100 disabled:opacity-40"
                >
                  {replyBusyId === claim.id
                    ? t("admin_claim_reply_sending")
                    : t("admin_claim_reply_send")}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {claim.uid && claim.moderationTag === "roleplay" ? (
                  <AdminUndoButton
                    uid={claim.uid}
                    undoAction="clear_moderation_tag"
                    onDone={() => void setStatus(claim.id, "revisado")}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => void setStatus(claim.id, "revisado")}
                  className="rounded-xl bg-green-500/20 px-4 py-2 text-sm font-black"
                >
                  {t("admin_appeal_mark_reviewed")}
                </button>
                <button
                  type="button"
                  onClick={() => void setStatus(claim.id, "descartado")}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black"
                >
                  {t("admin_appeal_dismiss")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
