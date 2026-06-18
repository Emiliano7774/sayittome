"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

import { isAdminEmail } from "@/lib/admin/isAdmin";
import { auth } from "@/lib/firebase";

export function useAdminSession() {
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setEmail(user?.email || "");
      setReady(true);
    });

    return () => unsub();
  }, []);

  return {
    ready,
    email,
    isLoggedIn: Boolean(email),
    isAdmin: isAdminEmail(email),
  };
}
