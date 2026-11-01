"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useSyncExternalStore } from "react";

import { isAdminEmail } from "@/lib/admin/isAdmin";
import { auth } from "@/lib/firebase";

type AdminSession = {
  ready: boolean;
  email: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
};

const UNKNOWN_SESSION: AdminSession = {
  ready: false,
  email: "",
  isLoggedIn: false,
  isAdmin: false,
};

let currentSession: AdminSession = UNKNOWN_SESSION;
let unsubscribeFirebase: (() => void) | null = null;
const sessionListeners = new Set<() => void>();

function publishSession(email: string, ready: boolean) {
  if (currentSession.email === email && currentSession.ready === ready) return;
  currentSession = {
    ready,
    email,
    isLoggedIn: Boolean(email),
    isAdmin: isAdminEmail(email),
  };
  for (const listener of sessionListeners) listener();
}

function ensureFirebaseSubscription() {
  if (unsubscribeFirebase || typeof window === "undefined") return;
  // Shuffle cards may mount hundreds of admin controls. All of them share
  // this one Firebase Auth listener instead of registering one per control.
  unsubscribeFirebase = onAuthStateChanged(
    auth,
    (user) => publishSession(user?.email || "", true),
    () => publishSession("", true),
  );
}

function subscribeSession(listener: () => void) {
  sessionListeners.add(listener);
  ensureFirebaseSubscription();
  return () => {
    sessionListeners.delete(listener);
    if (sessionListeners.size === 0) {
      unsubscribeFirebase?.();
      unsubscribeFirebase = null;
      // Do not expose a previous admin's email between route/auth sessions.
      currentSession = UNKNOWN_SESSION;
    }
  };
}

function readSession() {
  return currentSession;
}

function readServerSession() {
  return UNKNOWN_SESSION;
}

export function useAdminSession() {
  return useSyncExternalStore(subscribeSession, readSession, readServerSession);
}
