"use client";

import { useEffect, useState } from "react";

import AdminShell, { useAdminApi } from "@/components/admin/AdminShell";
import { auth } from "@/lib/firebase";

type UserBlurRow = {
  uid: string;
  username: string;
  blur: boolean;
};

export default function AdminBlurPage() {
  const admin = useAdminApi();
  const [users, setUsers] = useState<UserBlurRow[]>([]);

  async function load() {
    const email = auth.currentUser?.email || "";
    const res = await fetch("/api/admin/users", {
      headers: { "x-admin-email": email },
      cache: "no-store",
    });
    const json = await res.json();
    if (json?.ok) {
      setUsers((json.users || []).filter((u: UserBlurRow) => u.blur || true).slice(0, 120));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminShell title="Sistema de blur">
      <div className="space-y-3">
        {users.map((user) => (
          <div
            key={user.uid}
            className="rounded-2xl border border-white/10 p-4 flex items-center justify-between"
          >
            <p className="font-black">{user.username}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => admin.postAction({ action: "blur_profile", uid: user.uid })}
                className="rounded-xl bg-violet-500/20 px-4 py-2 font-black text-sm"
              >
                Blur perfil
              </button>
              <button
                type="button"
                onClick={() => admin.postAction({ action: "unblur_profile", uid: user.uid })}
                className="rounded-xl bg-white/10 px-4 py-2 font-black text-sm"
              >
                Unblur
              </button>
              <button
                type="button"
                onClick={() => admin.postAction({ action: "blur_stories_flag", uid: user.uid })}
                className="rounded-xl bg-fuchsia-500/20 px-4 py-2 font-black text-sm"
              >
                Blur historias
              </button>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
