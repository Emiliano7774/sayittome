"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import AdminRegistrationsPanel from "@/components/admin/AdminRegistrationsPanel";
import { auth } from "@/lib/firebase";

type AdminUserRow = {
  uid: string;
  username: string;
  email: string;
  photo: string;
  provincia: string;
  online: boolean;
  lastActive: string;
  blur: boolean;
  banned: boolean;
  shadowban: boolean;
  activeStories: number;
  abuseProtectionEnabled: boolean;
};

export default function AdminUsersPage() {
  const admin = useAdminApi();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [busyUid, setBusyUid] = useState("");
  const [orphanCount, setOrphanCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [duplicateCleanupBusy, setDuplicateCleanupBusy] = useState(false);

  async function load() {
    const email = auth.currentUser?.email || admin.email;
    const res = await fetch("/api/admin/users", {
      cache: "no-store",
      headers: { "x-admin-email": email },
    });
    const json = await res.json();
    if (json?.ok) setUsers(json.users || []);

    const orphanRes = await fetch("/api/admin/orphan-profiles", {
      cache: "no-store",
      headers: { "x-admin-email": email },
    });
    const orphanJson = await orphanRes.json();
    if (orphanJson?.ok) setOrphanCount(Number(orphanJson.count || 0));

    const duplicateRes = await fetch("/api/admin/duplicate-profiles", {
      cache: "no-store",
      headers: { "x-admin-email": email },
    });
    const duplicateJson = await duplicateRes.json();
    if (duplicateJson?.ok) {
      setDuplicateCount(Number(duplicateJson.duplicateCount || 0));
    }
  }

  useEffect(() => {
    load();
  }, [admin.email]);

  async function runAction(uid: string, action: string, extra?: Record<string, unknown>) {
    setBusyUid(uid);
    await admin.postAction({ action, uid, ...extra });
    await load();
    setBusyUid("");
  }

  async function cleanupOrphans() {
    if (!window.confirm(`¿Eliminar ${orphanCount} perfiles huérfanos/falsos?`)) return;

    setCleanupBusy(true);
    try {
      await admin.postAction({ action: "cleanup_orphan_profiles" });
      await load();
    } finally {
      setCleanupBusy(false);
    }
  }

  async function cleanupDuplicates() {
    if (!window.confirm(`¿Eliminar ${duplicateCount} perfiles duplicados?`)) return;

    setDuplicateCleanupBusy(true);
    try {
      await admin.postAction({ action: "cleanup_duplicate_profiles" });
      await load();
    } finally {
      setDuplicateCleanupBusy(false);
    }
  }

  return (
    <AdminShell title="Usuarios">
      <AdminRegistrationsPanel adminEmail={admin.email} defaultOpen />
      {duplicateCount > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-4">
          <div>
            <p className="text-sm font-black text-rose-200">
              {duplicateCount} perfiles duplicados detectados
            </p>
            <p className="mt-1 text-xs font-bold text-white/45">
              Mismo username en varios documentos de Firestore. Se conserva el perfil más completo.
            </p>
          </div>
          <button
            type="button"
            disabled={duplicateCleanupBusy}
            onClick={cleanupDuplicates}
            className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {duplicateCleanupBusy ? "Limpiando..." : "Eliminar duplicados"}
          </button>
        </div>
      ) : null}
      {orphanCount > 0 ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4">
          <div>
            <p className="text-sm font-black text-amber-200">
              {orphanCount} perfiles incompletos o falsos detectados
            </p>
            <p className="mt-1 text-xs font-bold text-white/45">
              Aparecen en shuffle pero no tienen perfil público válido. Conviene eliminarlos.
            </p>
          </div>
          <button
            type="button"
            disabled={cleanupBusy}
            onClick={cleanupOrphans}
            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-black disabled:opacity-50"
          >
            {cleanupBusy ? "Limpiando..." : "Eliminar huérfanos"}
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-3xl border border-white/10">
        <table className="min-w-[1200px] w-full text-left">
          <thead className="bg-white/5 text-white/50 text-sm font-black">
            <tr>
              <th className="px-4 py-4">Perfil</th>
              <th className="px-4 py-4">Username</th>
              <th className="px-4 py-4">Email</th>
              <th className="px-4 py-4">Online</th>
              <th className="px-4 py-4">Blur</th>
              <th className="px-4 py-4">Ban</th>
              <th className="px-4 py-4">Historias</th>
              <th className="px-4 py-4">Antiacoso</th>
              <th className="px-4 py-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.uid} className="border-t border-white/10">
                <td className="px-4 py-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10">
                    {user.photo ? (
                      <img src={user.photo} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 font-black">{user.username}</td>
                <td className="px-4 py-4 text-white/60 font-bold">{user.email || "-"}</td>
                <td className="px-4 py-4">
                  <span
                    className={[
                      "inline-flex rounded-full px-3 py-1 text-xs font-black",
                      user.online ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/50",
                    ].join(" ")}
                  >
                    {user.online ? "online" : "offline"}
                  </span>
                </td>
                <td className="px-4 py-4">{user.blur ? "si" : "no"}</td>
                <td className="px-4 py-4">{user.banned ? "si" : "no"}</td>
                <td className="px-4 py-4">{user.activeStories}</td>
                <td className="px-4 py-4">{user.abuseProtectionEnabled ? "on" : "off"}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyUid === user.uid}
                      onClick={() => runAction(user.uid, "ban_temp", { days: 7 })}
                      className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-black"
                    >
                      Ban 7d
                    </button>
                    <button
                      type="button"
                      disabled={busyUid === user.uid}
                      onClick={() => runAction(user.uid, "ban_perm")}
                      className="rounded-lg bg-red-600/30 px-3 py-2 text-xs font-black"
                    >
                      Ban perm
                    </button>
                    <button
                      type="button"
                      disabled={busyUid === user.uid}
                      onClick={() => runAction(user.uid, "blur_profile")}
                      className="rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-black"
                    >
                      Blur
                    </button>
                    <button
                      type="button"
                      disabled={busyUid === user.uid}
                      onClick={() => runAction(user.uid, "delete_user_stories")}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-black"
                    >
                      Borrar historias
                    </button>
                    <button
                      type="button"
                      disabled={busyUid === user.uid}
                      onClick={() =>
                        runAction(user.uid, "toggle_abuse_protection", {
                          enabled: !user.abuseProtectionEnabled,
                        })
                      }
                      className="rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-black"
                    >
                      Antiacoso
                    </button>
                    <Link
                      href={`/u/${encodeURIComponent(user.username)}`}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs font-black"
                    >
                      Perfil
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
