"use client";

import Link from "next/link";
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
import { useT } from "@/contexts/LocaleContext";
import { useUxMode } from "@/contexts/UxModeContext";

import {
  buildFollowId,
  resolveFollowButtonTargetUid,
} from "@/lib/profile/followTargetUid";

type Props = {
  targetUid: string;
  variant?: "default" | "profileClassic";
};

export default function FollowButton({ targetUid, variant = "default" }: Props) {
  const { uxMode } = useUxMode();
  const t = useT();

  const [myUid, setMyUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const [following, setFollowing] = useState(false);
  const [checkingFollow, setCheckingFollow] = useState(true);
  const [loading, setLoading] = useState(false);

  const resolvedTargetUid = resolveFollowButtonTargetUid(targetUid);
  const isSelf = Boolean(myUid && resolvedTargetUid && myUid === resolvedTargetUid);

  const followId = useMemo(() => {
    if (!myUid || !resolvedTargetUid) return "";
    return buildFollowId(myUid, resolvedTargetUid);
  }, [myUid, resolvedTargetUid]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setMyUid(user?.uid || "");
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!myUid || !resolvedTargetUid || myUid === resolvedTargetUid) {
      setFollowing(false);
      setCheckingFollow(false);
      return;
    }

    setCheckingFollow(true);

    const ref = doc(db, "seguidores", buildFollowId(myUid, resolvedTargetUid));

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
  }, [myUid, resolvedTargetUid]);

  async function toggleFollow() {
    if (!myUid || !resolvedTargetUid || myUid === resolvedTargetUid || loading) return;

    const nextFollowing = !following;

    setLoading(true);
    setFollowing(nextFollowing);

    try {
      const batch = writeBatch(db);

      const followRef = doc(db, "seguidores", followId);
      const followerSubRef = doc(
        db,
        "usuarios",
        resolvedTargetUid,
        "seguidores",
        myUid
      );
      const followingSubRef = doc(
        db,
        "usuarios",
        myUid,
        "siguiendo",
        resolvedTargetUid
      );

      const targetUserRef = doc(db, "usuarios", resolvedTargetUid);
      const myUserRef = doc(db, "usuarios", myUid);

      if (nextFollowing) {
        const payload = {
          id: followId,
          seguidorUid: myUid,
          seguidoUid: resolvedTargetUid,
          createdAt: serverTimestamp(),
        };

        batch.set(followRef, payload, { merge: true });
        batch.set(followerSubRef, payload, { merge: true });
        batch.set(
          followingSubRef,
          {
            id: followId,
            seguidorUid: myUid,
            seguidoUid: resolvedTargetUid,
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

  if (!authReady || !resolvedTargetUid || isSelf) return null;

  if (!myUid) {
    if (variant === "profileClassic") {
      return (
        <Link
          href="/login"
          className="h-[clamp(48px,5.5vw,60px)] rounded-full border-[3px] border-white bg-violet-600 px-6 text-[clamp(14px,1.6vw,18px)] font-black text-white shadow-[0_0_24px_rgba(139,92,246,.28)]"
        >
          {t("follow_login_required")}
        </Link>
      );
    }

    return (
      <Link
        href="/login"
        className="rounded-full border border-white/10 bg-[#111111] px-5 py-3 text-sm font-black text-white/80"
      >
        {t("follow_login_required")}
      </Link>
    );
  }

  const disabled = loading || checkingFollow;
  const label = disabled ? "..." : following ? t("follow_following") : t("follow_button");

  if (variant === "profileClassic") {
    return (
      <button
        type="button"
        onClick={toggleFollow}
        disabled={disabled}
        className={
          following
            ? "h-[clamp(52px,6vw,68px)] rounded-full border-[3px] border-white/70 bg-black/25 px-7 text-[clamp(16px,1.8vw,22px)] font-black text-white backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-50"
            : "h-[clamp(52px,6vw,68px)] rounded-full border-[3px] border-white bg-violet-600 px-7 text-[clamp(16px,1.8vw,22px)] font-black text-white shadow-[0_0_24px_rgba(139,92,246,.28)] disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {label}
      </button>
    );
  }

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
        {label}
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
      {label}
    </button>
  );
}
