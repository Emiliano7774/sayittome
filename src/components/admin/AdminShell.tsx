"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";

import { auth } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { usePhoneShell } from "@/hooks/usePhoneShell";
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
  const phoneShell = usePhoneShell();
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
    <div className="min-h-screen bg-black text-white flex flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b border-white/10 bg-[#050505] p-4 lg:w-[280px] lg:border-b-0 lg:border-r lg:p-6 lg:flex lg:flex-col">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div>
            <p className="text-xl font-black tracking-tight lg:text-2xl">SayItToMe</p>
            <p className="text-xs font-bold text-violet-300/80 mt-1 lg:text-sm">{t("admin_panel")}</p>
          </div>
          <Link
            href="/shuffle"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/70 hover:text-white lg:hidden"
          >
            {t("admin_back_app")}
          </Link>
        </div>

        <nav
          className={[
            "mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-1 lg:flex-1 lg:overflow-y-auto lg:pb-0",
            phoneShell ? "snap-x snap-mandatory" : "",
          ].join(" ")}
        >
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
                  "shrink-0 rounded-xl px-4 py-3 font-black transition lg:block",
                  phoneShell ? "text-sm snap-start" : "",
                  active
                    ? "bg-violet-500/20 text-violet-100 border border-violet-400/30"
                    : "text-white/55 hover:bg-white/5 hover:text-white border border-transparent",
                ].join(" ")}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <p className="hidden text-xs text-white/35 font-bold truncate lg:block">{email}</p>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/90 backdrop-blur-xl px-4 py-4 md:px-6 md:py-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-black">{title}</h1>
          <Link
            href="/shuffle"
            className="hidden rounded-full border border-white/15 px-5 py-2 text-sm font-black text-white/70 hover:text-white lg:inline-flex"
          >
            {t("admin_back_app")}
          </Link>
        </header>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6 lg:p-8">{children}</div>
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
