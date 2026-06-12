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

function blendNeighbor(
  target: SampleColor,
  source: SampleColor,
  bleed: number,
  colorWeight: number,
) {
  if (target.glow >= bleed) return;

  target.glow = bleed;
  target.r = Math.round(target.r * (1 - colorWeight) + source.r * colorWeight);
  target.g = Math.round(target.g * (1 - colorWeight) + source.g * colorWeight);
  target.b = Math.round(target.b * (1 - colorWeight) + source.b * colorWeight);
}

function spreadSegmentGlow(samples: SampleColor[]) {
  const spread = samples.map((sample) => ({ ...sample }));

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < spread.length; i++) {
      if (spread[i].glow < 0.06) continue;

      const bleedNear = spread[i].glow * (pass === 0 ? 0.5 : 0.28);
      const bleedFar = spread[i].glow * (pass === 0 ? 0.24 : 0.14);
      const nearWeight = pass === 0 ? 0.48 : 0.34;
      const farWeight = pass === 0 ? 0.3 : 0.22;

      if (i > 0) blendNeighbor(spread[i - 1], spread[i], bleedNear, nearWeight);
      if (i < spread.length - 1) blendNeighbor(spread[i + 1], spread[i], bleedNear, nearWeight);
      if (i > 1) blendNeighbor(spread[i - 2], spread[i], bleedFar, farWeight);
      if (i < spread.length - 2) blendNeighbor(spread[i + 2], spread[i], bleedFar, farWeight);
    }
  }

  return spread;
}

function updateClassicBarGlow() {
  const bar = document.querySelector<HTMLElement>(".sayittome-glass-bar-classic");
  if (!bar) return;

  const rect = bar.getBoundingClientRect();
  const navHeight =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sayittome-nav-height"),
    ) || 74;
  const sampleY = Math.max(0, rect.top + navHeight * SAMPLE_Y_RATIO);
  const width = window.innerWidth;

  const raw: SampleColor[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const x = ((i + 0.5) / SEGMENTS) * width;
    raw.push(colorAt(x, sampleY));
  }

  const samples = spreadSegmentGlow(raw);

  for (let i = 0; i < SEGMENTS; i++) {
    const sample = samples[i];
    const xPct = ((i + 0.5) / SEGMENTS) * 100;

    document.documentElement.style.setProperty(`--classic-bar-glow-${i}`, String(sample.glow));
    document.documentElement.style.setProperty(`--classic-bar-glow-x-${i}`, `${xPct}%`);
    document.documentElement.style.setProperty(`--classic-bar-r-${i}`, String(sample.r));
    document.documentElement.style.setProperty(`--classic-bar-g-${i}`, String(sample.g));
    document.documentElement.style.setProperty(`--classic-bar-b-${i}`, String(sample.b));
  }
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
      document.documentElement.style.setProperty(`--classic-bar-r-${i}`, "8");
      document.documentElement.style.setProperty(`--classic-bar-g-${i}`, "8");
      document.documentElement.style.setProperty(`--classic-bar-b-${i}`, "10");
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
        document.documentElement.style.removeProperty(`--classic-bar-r-${i}`);
        document.documentElement.style.removeProperty(`--classic-bar-g-${i}`);
        document.documentElement.style.removeProperty(`--classic-bar-b-${i}`);
      }
    };
  }, [enabled]);
}
