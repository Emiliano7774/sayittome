"use client";

import { useEffect, useState } from "react";

import RealDeviceQaDebugOverlay from "@/components/dev/RealDeviceQaDebugOverlay";
import {
  installRealDeviceQaDebugCapture,
  isRealDeviceQaDebugEnabled,
} from "@/lib/qa/realDeviceQaDebug";

export default function RealDeviceQaDebugBootstrap() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const on = isRealDeviceQaDebugEnabled();
    setEnabled(on);
    if (on) installRealDeviceQaDebugCapture();
  }, []);

  if (!enabled) return null;
  return <RealDeviceQaDebugOverlay />;
}
