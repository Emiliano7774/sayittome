"use client";

import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";

export default function AudioWave({
  url,
}: {
  url: string;
}) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  const waveRef =
    useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const wave = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#9f9fa8",
      progressColor: "#8b5cf6",
      cursorColor: "transparent",
      height: 38,
      barWidth: 3,
      barGap: 2,
      barRadius: 999,
      normalize: true,
      dragToSeek: true,
    });

    wave.load(url);

    waveRef.current = wave;

    return () => {
      wave.destroy();
    };
  }, [url]);

  return (
    <div
      ref={containerRef}
      className="w-[220px]"
    />
  );
}
