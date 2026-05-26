"use client";

import { useEffect } from "react";

import { startAnonymousPresenceSystem } from "@/services/anonymousPresence";

export default function AnonymousPresenceBootstrap() {
  useEffect(() => {
    startAnonymousPresenceSystem();
  }, []);

  return null;
}
