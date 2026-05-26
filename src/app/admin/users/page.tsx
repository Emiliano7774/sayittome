"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
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

  async function load() {
    const email = auth.currentUser?.email || admin.email;
    const res = await fetch("/api/admin/users", {
      cache: "no-store",
      headers: { "x-admin-email": email },
    });
    const json = await res.json();
    if (json?.ok) setUsers(json.users || []);
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

  return (
    <AdminShell title="Usuarios">
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
