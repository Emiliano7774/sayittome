"use client";

import type { ComponentType } from "react";

import BoostPage from "@/app/boost/page";
import ChatsPage from "@/app/chats/page";
import SettingsPage from "@/app/settings/page";
import ShufflePage from "@/app/shuffle/page";
import StoriesPage from "@/app/stories/page";
import { useMainTabShell } from "@/contexts/MainTabShellContext";
import type { MainTabHref } from "@/lib/navigation/mainTabs";

const PANELS: Record<MainTabHref, ComponentType> = {
  "/stories": StoriesPage,
  "/chats": ChatsPage,
  "/shuffle": ShufflePage,
  "/boost": BoostPage,
  "/settings": SettingsPage,
};

export default function MainTabShellPanels() {
  const { shellMountedTabs, activeShellTab } = useMainTabShell();

  return (
    <>
      {[...shellMountedTabs].map((href) => {
        const Panel = PANELS[href];
        const visible = activeShellTab === href;

        return (
          <div key={href} hidden={!visible} aria-hidden={!visible}>
            <Panel />
          </div>
        );
      })}
    </>
  );
}
