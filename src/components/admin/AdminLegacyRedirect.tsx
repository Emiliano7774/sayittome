"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLegacyRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="font-bold text-white/40">Redirigiendo...</p>
    </main>
  );
}
