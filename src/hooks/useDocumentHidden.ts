"use client";

import { useSyncExternalStore } from "react";

function subscribeHidden(onStoreChange: () => void) {
  document.addEventListener("visibilitychange", onStoreChange);
  return () => document.removeEventListener("visibilitychange", onStoreChange);
}

function getDocumentHidden() {
  return document.hidden;
}

function getServerDocumentHidden() {
  return false;
}

/** True when the tab is in the background (Page Visibility API). */
export function useDocumentHidden() {
  return useSyncExternalStore(
    subscribeHidden,
    getDocumentHidden,
    getServerDocumentHidden,
  );
}
