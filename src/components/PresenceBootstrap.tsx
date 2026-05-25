"use client";

import { useEffect } from "react";

import { startPresenceSystem } from "@/services/presence";

export default function PresenceBootstrap() {
  useEffect(() => {
    startPresenceSystem();
  }, []);

  return null;
}
