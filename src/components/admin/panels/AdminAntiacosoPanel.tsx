"use client";

import { collection, limit, onSnapshot, orderBy, query, startAfter, type QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useAdminApi } from "@/components/admin/AdminShell";
import { auth, db } from "@/lib/firebase";
import {
  isAbuseBlockActive,
  type AbuseBlockRecord,
} from "@/lib/abuse/anonAbuseBlocks";
import { PROFILE_ANON_ABUSE_BLOCK_MINUTES } from "@/lib/abuse/profileAnonAbuseBlock";

type AdminBlockRow = AbuseBlockRecord & {
  direction?: string;
  verifiedAuthLink?: string;
  verifiedVisitorAuthUid?: string;
  ipCoverage?: string;
  blockedAnonId?: string;
  expiresAtMs?: number;
  createdAtMs?: number;
  blockedByUid?: string;
  receptorUid?: string;
};

type AnonToProfileRow = {
  id: string;
  chatId?: string;
  anonSessionId?: string;
  blockedProfileUid?: string;
  blockedByAuthUid?: string;
};

type ResolvedLink = { link: string | null; label: string };

function formatMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toLocaleString();
  }
  const parsed = Date.parse(String(value || ""));
  if (Number.isFinite(parsed)) return new Date(parsed).toLocaleString();
  return "-";
}

async function resolveAdminProfileLink(uid: string): Promise<ResolvedLink> {
  const clean = String(uid || "").trim();
  if (!clean) return { link: null, label: "desconocido" };
  const user = auth.currentUser;
  if (!user) return { link: null, label: `${clean} (sin auth admin)` };
  const idToken = await user.getIdToken();
  const res = await fetch(`/api/admin/resolve-profile?uid=${encodeURIComponent(clean)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    hasProfile?: boolean;
    username?: string;
    link?: string | null;
    error?: string;
  };
  if (!res.ok || !json?.ok) {
    return { link: null, label: `${clean} (error resolución)` };
  }
  if (!json.hasProfile || !json.link) {
    return { link: null, label: `${clean} · sin perfil (anon Auth / legacy)` };
  }
  return { link: String(json.link), label: String(json.username || clean) };
}

function ProfileLink({ uid, kind }: { uid: string; kind: string }) {
  const [resolved, setResolved] = useState<ResolvedLink | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveAdminProfileLink(uid).then((row) => {
      if (!cancelled) setResolved(row);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!uid) return <span>desconocido</span>;
  if (!resolved) return <span className="text-white/40">{kind}: resolviendo…</span>;
  if (!resolved.link) {
    return (
      <span>
        {kind}: {resolved.label}
      </span>
    );
  }
  return (
    <a className="text-lime-300 underline" href={resolved.link}>
      {kind}: {resolved.label}
    </a>
  );
}

export default function AdminAntiacosoPanel() {
  const admin = useAdminApi();
  const [profileToAnon, setProfileToAnon] = useState<AdminBlockRow[]>([]);
  const [anonToProfile, setAnonToProfile] = useState<AnonToProfileRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [pageCursor, setPageCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    const q = query(collection(db, "anon_abuse_blocks"), orderBy("createdAt", "desc"), limit(40));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((docu) => ({
          id: docu.id,
          ...(docu.data() as Omit<AdminBlockRow, "id">),
        }));
        setProfileToAnon(rows);
        setPageCursor(snap.docs[snap.docs.length - 1] || null);
        setLoadError("");
      },
      (error) => {
        setLoadError(`Error cargando perfil→anon: ${String(error?.message || error)}`);
        setProfileToAnon([]);
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "anon_profile_blocks"), limit(40));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAnonToProfile(
          snap.docs.map((docu) => ({
            id: docu.id,
            ...(docu.data() as Omit<AnonToProfileRow, "id">),
          })),
        );
      },
      (error) => {
        setLoadError((prev) =>
          prev
            ? `${prev} · Error anon→perfil: ${String(error?.message || error)}`
            : `Error cargando anon→perfil: ${String(error?.message || error)}`,
        );
        setAnonToProfile([]);
      },
    );
    return () => unsub();
  }, []);

  const loadMore = useCallback(async () => {
    if (!pageCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { getDocs } = await import("firebase/firestore");
      const q = query(
        collection(db, "anon_abuse_blocks"),
        orderBy("createdAt", "desc"),
        startAfter(pageCursor),
        limit(40),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setPageCursor(null);
        return;
      }
      setProfileToAnon((prev) => [
        ...prev,
        ...snap.docs.map((docu) => ({
          id: docu.id,
          ...(docu.data() as Omit<AdminBlockRow, "id">),
        })),
      ]);
      setPageCursor(snap.docs[snap.docs.length - 1] || null);
    } catch (error) {
      setLoadError(`Error paginando historial: ${String((error as Error)?.message || error)}`);
    } finally {
      setLoadingMore(false);
    }
  }, [pageCursor, loadingMore]);

  async function removeBlock(blockId: string) {
    setBusyId(blockId);
    try {
      const json = (await admin.postAction({
        action: "remove_abuse_block",
        blockId,
      })) as { ok?: boolean; error?: string };
      if (!json?.ok) {
        setLoadError(`Quitar falló: ${String(json?.error || "unknown")}`);
      }
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      {loadError ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
          {loadError}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-black">Perfil → anónimo ({PROFILE_ANON_ABUSE_BLOCK_MINUTES} min)</h2>
        {profileToAnon.length === 0 && !loadError ? (
          <p className="text-sm text-white/40">Sin bloqueos perfil→anon.</p>
        ) : null}
        {profileToAnon.map((block) => {
          const active = isAbuseBlockActive(block);
          const verifiedUid =
            String(block.verifiedAuthLink || "") === "verified"
              ? String(block.verifiedVisitorAuthUid || "").trim()
              : "";
          const receptorUid = String(block.receptorUid || "").trim();
          return (
            <div
              key={block.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div>
                <p className="text-lg font-black">
                  {block.blockedAnonId || block.blockedFingerprint || block.id}
                </p>
                <p className="mt-1 text-sm font-bold text-white/50">
                  Dirección: profile→anon · Chat: {block.chatId || "-"}
                </p>
                <p className="text-sm font-bold text-white/50">
                  <ProfileLink uid={receptorUid} kind="Receptor" />
                </p>
                <p className="text-sm font-bold text-white/50">
                  Emisor AUTH:{" "}
                  {verifiedUid ? (
                    <ProfileLink uid={verifiedUid} kind="visitante" />
                  ) : (
                    "desconocido (legacy / sin lease)"
                  )}
                </p>
                <p className="text-sm font-bold text-white/50">
                  Quién bloqueó: {block.blockedByUid || block.blockedBy || "-"} · Motivo:{" "}
                  {block.motivo || "-"}
                </p>
                <p className="text-sm font-bold text-white/50">
                  Inicio: {formatMs(block.createdAtMs || block.createdAt)} · Expira:{" "}
                  {formatMs(block.expiresAtMs || block.expiresAt)} · IP:{" "}
                  {block.ipCoverage || "pending"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-black",
                    active ? "bg-red-500/20 text-red-200" : "bg-white/10 text-white/45",
                  ].join(" ")}
                >
                  {active ? "Activo" : "Vencido"}
                </span>
                <button
                  type="button"
                  disabled={busyId === block.id}
                  onClick={() => void removeBlock(block.id)}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black disabled:opacity-40"
                >
                  {busyId === block.id ? "…" : "Quitar"}
                </button>
              </div>
            </div>
          );
        })}
        {pageCursor ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black"
          >
            {loadingMore ? "Cargando…" : "Cargar más historial"}
          </button>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black">Anónimo → perfil (inverso)</h2>
        {anonToProfile.length === 0 ? (
          <p className="text-sm text-white/40">Sin bloqueos anon→perfil.</p>
        ) : (
          anonToProfile.map((block) => (
            <div
              key={block.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <p className="text-lg font-black">{block.anonSessionId || block.id}</p>
              <p className="mt-1 text-sm font-bold text-white/50">
                Dirección: anon→profile · Chat: {block.chatId || block.id}
              </p>
              <p className="text-sm font-bold text-white/50">
                <ProfileLink
                  uid={String(block.blockedProfileUid || "")}
                  kind="Perfil bloqueado"
                />
              </p>
              <p className="text-sm font-bold text-white/50">
                Bloqueado por AUTH:{" "}
                {block.blockedByAuthUid ? (
                  <ProfileLink uid={String(block.blockedByAuthUid)} kind="emisor" />
                ) : (
                  "desconocido"
                )}
              </p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
