"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";

import { auth } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { useT } from "@/contexts/LocaleContext";
import type { MessageKey } from "@/lib/i18n/getMessage";

const NAV: Array<{ href: string; key: MessageKey }> = [
  { href: "/admin", key: "admin_nav_dashboard" },
  { href: "/admin/users", key: "admin_nav_users" },
  { href: "/admin/stories", key: "admin_nav_stories" },
  { href: "/admin/chats", key: "admin_nav_chats" },
  { href: "/admin/reports", key: "admin_nav_reports" },
  { href: "/admin/moderation", key: "admin_nav_moderation" },
  { href: "/admin/blur", key: "admin_nav_blur" },
  { href: "/admin/analytics", key: "admin_nav_analytics" },
  { href: "/admin/antiacoso", key: "admin_nav_antiacoso" },
  { href: "/admin/logs", key: "admin_nav_logs" },
  { href: "/admin/config", key: "admin_nav_config" },
];

export default function AdminShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const userEmail = user?.email || "";
      setEmail(userEmail);
      setAllowed(isAdminEmail(userEmail));
      setReady(true);

      if (!user) {
        router.replace("/login?next=/admin");
      }
    });

    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-2xl font-black text-white/40">{t("admin_verifying")}</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-8 text-center">
        <div>
          <p className="text-4xl font-black">{t("admin_denied")}</p>
          <p className="mt-4 text-white/50 font-bold">{email || t("admin_no_session")}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      <aside className="w-[280px] shrink-0 border-r border-white/10 bg-[#050505] p-6 hidden lg:flex lg:flex-col">
        <p className="text-2xl font-black tracking-tight">SayItToMe</p>
        <p className="text-sm font-bold text-violet-300/80 mt-1">{t("admin_panel")}</p>

        <nav className="mt-8 space-y-1 flex-1 overflow-y-auto">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "block rounded-xl px-4 py-3 font-black transition",
                  active
                    ? "bg-violet-500/20 text-violet-100 border border-violet-400/30"
                    : "text-white/55 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <p className="text-xs text-white/35 font-bold truncate">{email}</p>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/90 backdrop-blur-xl px-6 py-5 flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-black">{title}</h1>
          <Link
            href="/shuffle"
            className="rounded-full border border-white/15 px-5 py-2 text-sm font-black text-white/70 hover:text-white"
          >
            {t("admin_back_app")}
          </Link>
        </header>

        <div className="p-6 md:p-8">{children}</div>
      </div>
    </div>
  );
}

export function useAdminApi() {
  const email = auth.currentUser?.email || "";

  return {
    email,
    headers: {
      "Content-Type": "application/json",
      "x-admin-email": email,
    },
    async postAction(payload: Record<string, unknown>) {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-email": email,
        },
        body: JSON.stringify({ ...payload, adminEmail: email }),
      });
      return res.json();
    },
  };
}
