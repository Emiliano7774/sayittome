"use client";

import { useEffect } from "react";

import { attachNavInputDiag, isNavInputDiagEnabled } from "@/lib/perf/navInputDiag";

export default function NavInputDiagBootstrap() {
  useEffect(() => {
    if (!isNavInputDiagEnabled()) return;
    attachNavInputDiag();
  }, []);

  return null;
}
