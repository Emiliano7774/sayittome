"use client";

import { useEffect } from "react";

import { startPresenceSystem } from "@/services/presence";
import { startUsagePing } from "@/lib/usage/usagePingClient";

export default function PresenceBootstrap() {
  useEffect(() => {
    startPresenceSystem();
    startUsagePing();
  }, []);

  return null;
}
