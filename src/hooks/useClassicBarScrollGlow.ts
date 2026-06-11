"use client";

import { useEffect } from "react";

const SEGMENTS = 5;
const SAMPLE_Y_OFFSET = 48;

let sampleCanvas: HTMLCanvasElement | null = null;
let sampleCtx: CanvasRenderingContext2D | null = null;

function getSampleCtx() {
  if (typeof document === "undefined") return null;
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 6;
    sampleCanvas.height = 6;
    sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  }
  return sampleCtx;
}

function parseRgb(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function luminance(r: number, g: number, b: number) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function sampleImageAt(img: HTMLImageElement, x: number, y: number) {
  const ctx = getSampleCtx();
  if (!ctx || !img.complete || !img.naturalWidth) return 0;

  const rect = img.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return 0;

  const sx = ((x - rect.left) / rect.width) * img.naturalWidth;
  const sy = ((y - rect.top) / rect.height) * img.naturalHeight;

  try {
    ctx.clearRect(0, 0, 6, 6);
    ctx.drawImage(img, sx - 3, sy - 3, 6, 6, 0, 0, 6, 6);
    const data = ctx.getImageData(0, 0, 6, 6).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += luminance(data[i], data[i + 1], data[i + 2]);
    }
    return sum / (data.length / 4);
  } catch {
    return 0.28;
  }
}

function brightnessAt(x: number, y: number) {
  const stack = document.elementsFromPoint(x, y);
  let best = 0;

  for (const el of stack) {
    if (el.closest(".sayittome-glass-bar-classic")) continue;

    if (el instanceof HTMLImageElement) {
      best = Math.max(best, sampleImageAt(el, x, y));
      if (best > 0.55) return best;
      continue;
    }

    if (el instanceof HTMLVideoElement) {
      best = Math.max(best, 0.42);
      continue;
    }

    const bg = getComputedStyle(el).backgroundColor;
    const rgb = parseRgb(bg);
    if (rgb) {
      const lum = luminance(rgb[0], rgb[1], rgb[2]);
      if (lum > 0.04) best = Math.max(best, lum);
    }
  }

  return best;
}

function readScrollY() {
  const root = document.querySelector<HTMLElement>("[data-scroll-root]");
  if (root && root.scrollHeight > root.clientHeight + 1) {
    return root.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function updateClassicBarGlow() {
  const bar = document.querySelector<HTMLElement>(".sayittome-glass-bar-classic");
  if (!bar) return;

  const rect = bar.getBoundingClientRect();
  const sampleY = Math.max(0, rect.top - SAMPLE_Y_OFFSET);
  const width = window.innerWidth;

  for (let i = 0; i < SEGMENTS; i++) {
    const x = ((i + 0.5) / SEGMENTS) * width;
    const raw = brightnessAt(x, sampleY);
    const glow = Math.max(0, Math.min(1, (raw - 0.12) * 1.35));
    const xPct = ((i + 0.5) / SEGMENTS) * 100;

    document.documentElement.style.setProperty(`--classic-bar-glow-${i}`, String(glow));
    document.documentElement.style.setProperty(`--classic-bar-glow-x-${i}`, `${xPct}%`);
  }

  document.documentElement.style.setProperty("--classic-bar-glow-shift", String(readScrollY()));
}

export function useClassicBarScrollGlow(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let frame = 0;

    function schedule() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateClassicBarGlow();
      });
    }

    for (let i = 0; i < SEGMENTS; i++) {
      document.documentElement.style.setProperty(`--classic-bar-glow-${i}`, "0");
      document.documentElement.style.setProperty(`--classic-bar-glow-x-${i}`, `${((i + 0.5) / SEGMENTS) * 100}%`);
    }

    schedule();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    const roots = document.querySelectorAll<HTMLElement>("[data-scroll-root]");
    roots.forEach((root) => root.addEventListener("scroll", schedule, { passive: true }));

    const list = document.querySelector<HTMLElement>("[data-shuffle-list]");
    const observer = list ? new MutationObserver(schedule) : null;
    if (list && observer) {
      observer.observe(list, { childList: true, subtree: true });
      list.addEventListener("load", schedule, true);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      roots.forEach((root) => root.removeEventListener("scroll", schedule));
      if (list) list.removeEventListener("load", schedule, true);
      observer?.disconnect();

      for (let i = 0; i < SEGMENTS; i++) {
        document.documentElement.style.removeProperty(`--classic-bar-glow-${i}`);
        document.documentElement.style.removeProperty(`--classic-bar-glow-x-${i}`);
      }
      document.documentElement.style.removeProperty("--classic-bar-glow-shift");
    };
  }, [enabled]);
}
