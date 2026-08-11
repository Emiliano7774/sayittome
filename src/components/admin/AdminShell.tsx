"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { History, LayoutDashboard, Shield, Settings, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { auth } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { fastRouterPush } from "@/lib/navigation/fastNavigate";
import { useT } from "@/contexts/LocaleContext";
import type { MessageKey } from "@/lib/i18n/getMessage";

const NAV: Array<{
  href: string;
  key: MessageKey;
  icon: typeof LayoutDashboard;
  match: (pathname: string) => boolean;
}> = [
  {
    href: "/admin",
    key: "admin_nav_overview",
    icon: LayoutDashboard,
    match: (pathname) => pathname === "/admin",
  },
  {
    href: "/admin/moderation",
    key: "admin_nav_moderation",
    icon: Shield,
    match: (pathname) =>
      pathname.startsWith("/admin/moderation") || pathname.startsWith("/admin/chats"),
  },
  {
    href: "/admin/users",
    key: "admin_nav_users",
    icon: Users,
    match: (pathname) => pathname.startsWith("/admin/users"),
  },
  {
    href: "/admin/system",
    key: "admin_nav_system",
    icon: Settings,
    match: (pathname) => pathname.startsWith("/admin/system"),
  },
  {
    href: "/admin/authorship",
    key: "admin_nav_authorship",
    icon: History,
    match: (pathname) => pathname.startsWith("/admin/authorship"),
  },
];

function NavLink({
  item,
  active,
  compact = false,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={(event) => {
        if (active) return;
        event.preventDefault();
        fastRouterPush(router, item.href);
      }}
      className={[
        compact
          ? "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-black"
          : "flex items-center gap-3 rounded-xl border px-4 py-3 font-black transition",
        active
          ? compact
            ? "text-violet-200"
            : "border-violet-400/30 bg-violet-500/20 text-violet-100"
          : compact
            ? "text-white/45"
            : "border-transparent text-white/55 hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      <Icon size={compact ? 20 : 18} strokeWidth={2.2} />
      <span>{t(item.key)}</span>
    </Link>
  );
}

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
    document.body.classList.add("sayittome-admin-open");
    return () => {
      document.body.classList.remove("sayittome-admin-open");
    };
  }, []);

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
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black text-white/40">{t("admin_verifying")}</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-8 text-center text-white">
        <div>
          <p className="text-4xl font-black">{t("admin_denied")}</p>
          <p className="mt-4 font-bold text-white/50">{email || t("admin_no_session")}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black text-white lg:flex-row">
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/10 bg-[#050505] p-6 lg:flex">
        <div>
          <p className="text-2xl font-black tracking-tight">SayItToMe</p>
          <p className="mt-1 text-sm font-bold text-violet-300/80">{t("admin_panel")}</p>
        </div>

        <nav className="mt-8 flex-1 space-y-1">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={item.match(pathname)} />
          ))}
        </nav>

        <p className="truncate text-xs font-bold text-white/35">{email}</p>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(74px+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-black/90 px-4 py-4 backdrop-blur-xl md:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300/70 lg:hidden">
              {t("admin_panel")}
            </p>
            <h1 className="text-2xl font-black md:text-3xl">{title}</h1>
          </div>
          <Link
            href="/shuffle"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/70 hover:text-white md:text-sm"
          >
            {t("admin_back_app")}
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-[10001] border-t border-white/10 bg-[#070707]/95 backdrop-blur-xl lg:hidden">
        <div className="flex items-stretch px-1 pb-[env(safe-area-inset-bottom)] pt-1">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} active={item.match(pathname)} compact />
          ))}
        </div>
      </nav>
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
      const { postAdminAction } = await import("@/lib/admin/postAdminAction");
      return postAdminAction(email, payload);
    },
  };
}
