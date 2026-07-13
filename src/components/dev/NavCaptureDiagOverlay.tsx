"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import {
  getNavCaptureState,
  getNavCaptureVersion,
  isNavDiagOverlayEnabled,
  subscribeNavCaptureDiag,
  syncNavCaptureFromDom,
} from "@/lib/perf/navCaptureDiag";

export default function NavCaptureDiagOverlay() {
  const pathname = usePathname();

  const version = useSyncExternalStore(
    subscribeNavCaptureDiag,
    getNavCaptureVersion,
    getNavCaptureVersion,
  );

  if (!isNavDiagOverlayEnabled()) return null;

  syncNavCaptureFromDom(pathname);
  const { navSeq, phase, surface } = getNavCaptureState();

  return (
    <div
      id="sayittome-nav-diag-overlay"
      aria-hidden
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 2147483646,
        pointerEvents: "none",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.35,
        color: "#fff",
        background: "rgba(0,0,0,0.72)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 8,
        padding: "8px 10px",
        maxWidth: 280,
        whiteSpace: "pre-wrap",
      }}
    >
      <div>navSeq={navSeq}</div>
      <div>phase={phase}</div>
      <div>surface={surface}</div>
      <div>path={pathname.split("?")[0]}</div>
      <div>v={version}</div>
    </div>
  );
}
