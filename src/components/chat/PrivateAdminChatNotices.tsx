"use client";

import { useEffect, useState } from "react";
import { collection, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

/**
 * Separate recipient-only Firestore path. Never persist private moderation
 * notices in shared chats/{id}/mensajes or chats_anonimos/{id}/mensajes.
 */
type PrivateNotice = {
  id: string;
  text: string;
  createdAt?: { toDate?: () => Date };
};

export default function PrivateAdminChatNotices({ chatId }: { chatId: string }) {
  const [uid, setUid] = useState(auth.currentUser?.uid || "");
  const [notices, setNotices] = useState<PrivateNotice[]>([]);

  useEffect(() => onAuthStateChanged(auth, (user) => setUid(user?.uid || "")), []);

  useEffect(() => {
    setNotices([]);
    if (!chatId || !uid) return;
    const ref = collection(db, "admin_chat_notices", uid, "threads", chatId, "messages");
    const q = query(ref, orderBy("createdAt", "asc"), limitToLast(50));
    return onSnapshot(
      q,
      (snapshot) => {
        setNotices(
          snapshot.docs
            .map((doc) => ({
              id: doc.id,
              text: String(doc.data().text || ""),
              createdAt: doc.data().createdAt as PrivateNotice["createdAt"],
            }))
            .filter((message) => message.text.length > 0),
        );
      },
      () => setNotices([]),
    );
  }, [chatId, uid]);

  if (!notices.length) return null;
  return (
    <div className="w-full space-y-3 py-3" data-private-admin-notices="true">
      {notices.map((notice) => (
        <div key={notice.id} className="flex w-full justify-start">
          <div className="max-w-[92%] select-none rounded-2xl border border-amber-400/40 bg-amber-950/45 px-4 py-3 text-left text-sm text-amber-50" onContextMenu={(event) => event.preventDefault()}>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
              Administración de SayItToMe · Aviso oficial
            </p>
            <p className="whitespace-pre-wrap break-words">{notice.text}</p>
            {notice.createdAt?.toDate ? (
              <p className="mt-2 text-[10px] text-amber-200/55">
                {notice.createdAt.toDate().toLocaleString("es-AR")}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
