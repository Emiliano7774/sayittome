"use client";

import { useEffect, useState } from "react";

import { isPhoneShell } from "@/lib/app/deviceShell";

export function usePhoneShell() {
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const sync = () => setPhone(isPhoneShell());
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return phone;
}
