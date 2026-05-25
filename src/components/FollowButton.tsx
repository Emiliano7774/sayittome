"use client";

import { useEffect, useMemo, useState } from "react";

import { onAuthStateChanged } from "firebase/auth";

import {
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import { useUxMode } from "@/contexts/UxModeContext";

type Props = {
  targetUid: string;
};

function buildFollowId(myUid: string, targetUid: string) {
  return myUid + "_" + targetUid;
}

export default function FollowButton({ targetUid }: Props) {
  const { uxMode } = useUxMode();

  const [myUid, setMyUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const [following, setFollowing] = useState(false);
  const [checkingFollow, setCheckingFollow] = useState(true);
  const [loading, setLoading] = useState(false);

  const isSelf = Boolean(myUid && targetUid && myUid === targetUid);
  const canRender = authReady && Boolean(myUid) && Boolean(targetUid) && !isSelf;

  const followId = useMemo(() => {
    if (!myUid || !targetUid) return "";
    return buildFollowId(myUid, targetUid);
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
      setFollowing(false);
      setCheckingFollow(false);
      return;
    }

    setCheckingFollow(true);

    const ref = doc(db, "seguidores", buildFollowId(myUid, targetUid));

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setFollowing(snap.exists());
        setCheckingFollow(false);
      },
      (e) => {
        console.error("follow snapshot error", e);
        setCheckingFollow(false);
      }
    );

    return () => unsub();
  }, [myUid, targetUid]);

  async function toggleFollow() {
    if (!myUid || !targetUid || myUid === targetUid || loading) return;

    const nextFollowing = !following;

    setLoading(true);
    setFollowing(nextFollowing);

    try {
      const batch = writeBatch(db);

      const followRef = doc(db, "seguidores", followId);
      const followerSubRef = doc(
        db,
        "usuarios",
        targetUid,
        "seguidores",
        myUid
      );
      const followingSubRef = doc(
        db,
        "usuarios",
        myUid,
        "siguiendo",
        targetUid
      );

      const targetUserRef = doc(db, "usuarios", targetUid);
      const myUserRef = doc(db, "usuarios", myUid);

      if (nextFollowing) {
        const payload = {
          id: followId,
          seguidorUid: myUid,
          seguidoUid: targetUid,
          createdAt: serverTimestamp(),
        };

        batch.set(followRef, payload, { merge: true });
        batch.set(followerSubRef, payload, { merge: true });
        batch.set(
          followingSubRef,
          {
            id: followId,
            seguidorUid: myUid,
            seguidoUid: targetUid,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(
          targetUserRef,
          {
            seguidoresCount: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(
          myUserRef,
          {
            siguiendoCount: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        batch.delete(followRef);
        batch.delete(followerSubRef);
        batch.delete(followingSubRef);

        batch.set(
          targetUserRef,
          {
            seguidoresCount: increment(-1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(
          myUserRef,
          {
            siguiendoCount: increment(-1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
    } catch (e) {
      console.error("follow toggle error", e);
      setFollowing(!nextFollowing);
      alert("No se pudo actualizar el seguimiento.");
    } finally {
      setLoading(false);
    }
  }

  if (!canRender) return null;

  const disabled = loading || checkingFollow;

  if (uxMode === "classic") {
    return (
      <button
        type="button"
        onClick={toggleFollow}
        disabled={disabled}
        className={
          following
            ? "rounded-full border border-white/10 bg-[#111111] px-5 py-3 text-sm font-black text-white shadow-[0_0_18px_rgba(139,92,246,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
            : "rounded-full bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(139,92,246,0.32)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {disabled ? "..." : following ? "Siguiendo" : "Seguir"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={disabled}
      className={
        following
          ? "rounded-full border border-white/15 bg-zinc-900 px-5 py-3 text-sm font-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          : "rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {disabled ? "..." : following ? "Siguiendo" : "Seguir"}
    </button>
  );
}
