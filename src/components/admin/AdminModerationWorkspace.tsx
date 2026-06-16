"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";

import AdminAntiacosoPanel from "@/components/admin/panels/AdminAntiacosoPanel";
import AdminGeneralClaimsPanel from "@/components/admin/panels/AdminGeneralClaimsPanel";
import AdminReportsPanel from "@/components/admin/panels/AdminReportsPanel";
import AdminStoriesPanel from "@/components/admin/panels/AdminStoriesPanel";
import SpectatorModerationHub from "@/components/admin/spectator/SpectatorModerationHub";
import { useT } from "@/contexts/LocaleContext";
import type { MessageKey } from "@/lib/i18n/getMessage";

export type AdminModerationTab =
  | "reports"
  | "fake_profiles"
  | "claims"
  | "chats"
  | "stories"
  | "antiacoso";

const TABS: AdminModerationTab[] = [
  "reports",
  "fake_profiles",
  "claims",
  "chats",
  "stories",
  "antiacoso",
];

const TAB_KEYS: Record<AdminModerationTab, MessageKey> = {
  reports: "admin_mod_tab_reports",
  fake_profiles: "admin_mod_tab_fake_profiles",
  claims: "admin_mod_tab_claims",
  chats: "admin_mod_tab_chats",
  stories: "admin_mod_tab_stories",
  antiacoso: "admin_mod_tab_antiacoso",
};

function AdminModerationWorkspaceInner() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const normalizedTab = rawTab === "appeals" ? "claims" : rawTab;
  const activeTab: AdminModerationTab = TABS.includes(normalizedTab as AdminModerationTab)
    ? (normalizedTab as AdminModerationTab)
    : "reports";

  const setTab = useCallback(
    (tab: AdminModerationTab) => {
      router.replace(`/admin/moderation?tab=${tab}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTab(tab)}
            className={[
              "shrink-0 snap-start rounded-full border px-4 py-2.5 text-sm font-black transition",
              activeTab === tab
                ? "border-violet-400/35 bg-violet-500/15 text-violet-100"
                : "border-white/10 bg-[#111] text-white/45",
            ].join(" ")}
          >
            {t(TAB_KEYS[tab])}
          </button>
        ))}
      </div>

      {activeTab === "reports" ? <AdminReportsPanel filter="all" /> : null}
      {activeTab === "fake_profiles" ? <AdminReportsPanel filter="fake_profiles" /> : null}
      {activeTab === "claims" ? <AdminGeneralClaimsPanel /> : null}
      {activeTab === "chats" ? <SpectatorModerationHub /> : null}
      {activeTab === "stories" ? <AdminStoriesPanel /> : null}
      {activeTab === "antiacoso" ? <AdminAntiacosoPanel /> : null}
    </div>
  );
}

export default function AdminModerationWorkspace() {
  return (
    <Suspense fallback={<p className="text-white/40 font-bold">Cargando moderación...</p>}>
      <AdminModerationWorkspaceInner />
    </Suspense>
  );
}
