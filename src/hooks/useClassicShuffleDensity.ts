"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  readClassicShuffleDensity,
  writeClassicShuffleDensity,
  type ClassicShuffleDensity,
} from "@/lib/shuffle/classicDensity";

let density = readClassicShuffleDensity();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return density;
}

function setDensity(next: ClassicShuffleDensity) {
  density = next;
  writeClassicShuffleDensity(next);
  listeners.forEach((listener) => listener());
}

export function useClassicShuffleDensity() {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => 20 as ClassicShuffleDensity);

  const update = useCallback((next: ClassicShuffleDensity) => {
    setDensity(next);
  }, []);

  return { density: value, setDensity: update };
}
