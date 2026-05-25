"use client";

import { useEffect, useMemo, useState } from "react";

import { onAuthStateChanged } from "firebase/auth";

import {
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { useUxMode } from "@/contexts/UxModeContext";

type Props = {
  targetUid: string;
};

function buildLikeId(myUid: string, targetUid: string) {
  return myUid + "_" + targetUid;
}

export default function LikeProfileButton({ targetUid }: Props) {
  const { uxMode } = useUxMode();

  const [myUid, setMyUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const [liked, setLiked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const isSelf = Boolean(myUid && targetUid && myUid === targetUid);

  const likeId = useMemo(() => {
    if (!myUid || !targetUid) return "";
    return buildLikeId(myUid, targetUid);
  }, [myUid, targetUid]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setMyUid(user?.uid || "");
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!myUid || !targetUid || myUid === targetUid) {
      setLiked(false);
      setChecking(false);
      return;
    }

    setChecking(true);

    const ref = doc(db, "perfil_likes", likeId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setLiked(snap.exists());
        setChecking(false);
      },
      (e) => {
        console.error("profile like snapshot error", e);
        setChecking(false);
      }
    );

    return () => unsub();
  }, [myUid, targetUid, likeId]);

  async function toggleLike() {
    if (!myUid || !targetUid || myUid === targetUid || loading) return;

    const nextLiked = !liked;

    setLoading(true);
    setLiked(nextLiked);

    try {
      const batch = writeBatch(db);

      const likeRef = doc(db, "perfil_likes", likeId);

      const targetLikeRef = doc(
        db,
        "usuarios",
        targetUid,
        "likes_recibidos",
        myUid
      );

      const myLikeRef = doc(
        db,
        "usuarios",
        myUid,
        "likes_dados",
        targetUid
      );

      const targetUserRef = doc(db, "usuarios", targetUid);

      if (nextLiked) {
        const payload = {
          id: likeId,
          fromUid: myUid,
          targetUid,
          createdAt: serverTimestamp(),
        };

        batch.set(likeRef, payload, { merge: true });
        batch.set(targetLikeRef, payload, { merge: true });

        batch.set(
          myLikeRef,
          {
            id: likeId,
            targetUid,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(
          targetUserRef,
          {
            likesPerfilCount: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        batch.delete(likeRef);
        batch.delete(targetLikeRef);
        batch.delete(myLikeRef);

        batch.set(
          targetUserRef,
          {
            likesPerfilCount: increment(-1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
    } catch (e) {
      console.error("profile like error", e);
      setLiked(!nextLiked);
      alert("No se pudo actualizar el like.");
    } finally {
      setLoading(false);
    }
  }

  if (!authReady || !myUid || isSelf) return null;

  const disabled = loading || checking;

  if (uxMode === "classic") {
    return (
      <button
        type="button"
        onClick={toggleLike}
        disabled={disabled}
        className={
          liked
            ? "rounded-full border border-pink-400/20 bg-pink-500/15 px-5 py-3 text-sm font-black text-pink-200 shadow-[0_0_22px_rgba(236,72,153,0.25)] disabled:opacity-40"
            : "rounded-full border border-white/10 bg-[#111111] px-5 py-3 text-sm font-black text-white transition hover:border-pink-400/40 disabled:opacity-40"
        }
      >
        {disabled ? "..." : liked ? "Te gusta" : "Me gusta"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleLike}
      disabled={disabled}
      className={
        liked
          ? "rounded-full bg-pink-500 px-5 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(236,72,153,0.32)] transition hover:scale-[1.01] disabled:opacity-40"
          : "rounded-full border border-white/10 bg-zinc-950 px-5 py-3 text-sm font-black text-white transition hover:border-pink-400/40 disabled:opacity-40"
      }
    >
      {disabled ? "..." : liked ? "Te gusta" : "Me gusta"}
    </button>
  );
}
