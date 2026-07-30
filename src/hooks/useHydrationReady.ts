"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** False for SSR and hydration, true immediately after hydration completes. */
export function useHydrationReady() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
