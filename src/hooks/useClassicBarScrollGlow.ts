"use client";

import { useEffect } from "react";

const SEGMENTS = 7;
/** Sample inside the glass band so elementsFromPoint skips the bar and reads feed behind it. */
const SAMPLE_Y_RATIO = 0.42;

let sampleCanvas: HTMLCanvasElement | null = null;
let sampleCtx: CanvasRenderingContext2D | null = null;

type SampleColor = {
  r: number;
  g: number;
  b: number;
  glow: number;
};

function getSampleCtx() {
  if (typeof document === "undefined") return null;
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 8;
    sampleCanvas.height = 8;
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

function glowFromLum(lum: number) {
  return Math.max(0, Math.min(1, (lum - 0.06) * 1.35));
}

function sampleImageColorAt(img: HTMLImageElement, x: number, y: number): SampleColor | null {
  const ctx = getSampleCtx();
  if (!ctx || !img.complete || !img.naturalWidth) return null;

  const rect = img.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

  const sx = ((x - rect.left) / rect.width) * img.naturalWidth;
  const sy = ((y - rect.top) / rect.height) * img.naturalHeight;

  try {
    ctx.clearRect(0, 0, 8, 8);
    ctx.drawImage(img, sx - 4, sy - 4, 8, 8, 0, 0, 8, 8);
    const data = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let lum = 0;
    const count = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      lum += luminance(data[i], data[i + 1], data[i + 2]);
    }

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    lum = lum / count;

    return { r, g, b, glow: glowFromLum(lum) };
  } catch {
    return { r: 120, g: 120, b: 130, glow: 0.22 };
  }
}

function colorAt(x: number, y: number): SampleColor {
  const stack = document.elementsFromPoint(x, y);
  let best: SampleColor = { r: 8, g: 8, b: 10, glow: 0 };

  for (const el of stack) {
    if (el.closest(".sayittome-glass-bar-classic")) continue;

    if (el instanceof HTMLImageElement) {
      const sampled = sampleImageColorAt(el, x, y);
      if (sampled && sampled.glow > best.glow) best = sampled;
      if (best.glow > 0.6) return best;
      continue;
    }

    if (el instanceof HTMLVideoElement) {
      const candidate = { r: 150, g: 150, b: 165, glow: 0.38 };
      if (candidate.glow > best.glow) best = candidate;
      continue;
    }

    const bg = getComputedStyle(el).backgroundColor;
    const rgb = parseRgb(bg);
    if (rgb) {
      const glow = glowFromLum(luminance(rgb[0], rgb[1], rgb[2]));
      if (glow > best.glow) {
        best = { r: rgb[0], g: rgb[1], b: rgb[2], glow };
      }
    }
  }

  return best;
}

/* Smoothed state so the reflection drifts instead of flickering between frames. */
let currentR = 140;
let currentG = 95;
let currentB = 255;
let currentAlpha = 0.12;
let currentX = 50;

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function updateClassicBarReflection() {
  const bar = document.querySelector<HTMLElement>(".sayittome-glass-bar-classic");
  if (!bar) return;

  const rect = bar.getBoundingClientRect();
  const navHeight =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sayittome-nav-height"),
    ) || 74;
  const sampleY = Math.max(0, rect.top + navHeight * SAMPLE_Y_RATIO);
  const width = window.innerWidth;

  let best: SampleColor = { r: 8, g: 8, b: 10, glow: 0 };
  let bestX = 50;

  for (let i = 0; i < SEGMENTS; i++) {
    const xPct = ((i + 0.5) / SEGMENTS) * 100;
    const sample = colorAt((xPct / 100) * width, sampleY);
    if (sample.glow > best.glow) {
      best = sample;
      bestX = xPct;
    }
  }

  /* Dark content -> faint neutral reflection. Bright/colored content -> soft tinted
     reflection. Alpha stays low so the base never reads as transparent. */
  const targetAlpha = best.glow < 0.08 ? 0.1 : 0.1 + best.glow * 0.16;
  const targetR = best.glow < 0.08 ? 140 : best.r;
  const targetG = best.glow < 0.08 ? 95 : best.g;
  const targetB = best.glow < 0.08 ? 255 : best.b;

  currentR = lerp(currentR, targetR, 0.35);
  currentG = lerp(currentG, targetG, 0.35);
  currentB = lerp(currentB, targetB, 0.35);
  currentAlpha = lerp(currentAlpha, targetAlpha, 0.35);
  currentX = lerp(currentX, bestX, 0.3);

  const root = document.documentElement.style;
  root.setProperty(
    "--nav-reflect-color",
    `rgba(${Math.round(currentR)}, ${Math.round(currentG)}, ${Math.round(currentB)}, ${currentAlpha.toFixed(3)})`,
  );
  root.setProperty("--nav-glow-x", `${currentX.toFixed(1)}%`);
}

export function useClassicBarScrollGlow(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let frame = 0;

    function schedule() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateClassicBarReflection();
      });
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

      document.documentElement.style.removeProperty("--nav-reflect-color");
      document.documentElement.style.removeProperty("--nav-glow-x");
    };
  }, [enabled]);
}
