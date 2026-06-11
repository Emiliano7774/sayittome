"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import AdminShell from "@/components/admin/AdminShell";
import AdminChatReviewView from "@/components/admin/review/AdminChatReviewView";

export default function AdminModerationUserPage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const username = decodeURIComponent(String(params.username || ""));

  return (
    <AdminShell title={`Revisar · ${username}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/chats")}
          className="rounded-full border border-white/15 bg-[#111] px-4 py-2 text-sm font-bold"
        >
          ← Volver al listado
        </button>
        <Link
          href={`/u/${encodeURIComponent(username)}`}
          className="rounded-full border border-white/15 bg-[#111] px-4 py-2 text-sm font-bold"
        >
          Ver perfil público
        </Link>
      </div>

      <AdminChatReviewView username={username} />
    </AdminShell>
  );
}
