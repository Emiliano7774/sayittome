"use client";

import { Bell, Flag, MoreHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ContentReportDialog, { type ContentReportKind } from "@/components/moderation/ContentReportDialog";
import StoryNotificationSettings from "@/components/stories/StoryNotificationSettings";
import { useT } from "@/contexts/LocaleContext";
import { useOverlayBackClose } from "@/hooks/useOverlayBackClose";
import {
  fitAnchoredMenu,
  readBottomUiReserve,
  readVisualViewportBox,
} from "@/lib/overlay/fitAnchoredMenu";
import { measureMenuBox, unlockDocumentFixedClip } from "@/lib/overlay/menuClipAudit";
import {
  getProfileOptionsActionStyle,
  getProfileOptionsSheetStyle,
  shouldIgnoreProfileOptionsDismiss,
  shouldUseProfileOptionsSheet,
} from "@/lib/overlay/profileOptionsMenuLayout";
import { resolveProfileOptionsMenuPortalRoot } from "@/lib/overlay/profileOptionsMenuPortal";

type Props = {
  peerUid: string;
  peerUsername: string;
  className?: string;
};

export default function ProfilePeerOptionsMenu({
  peerUid,
  peerUsername,
  className = "",
}: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    right: number;
    maxHeight: number;
    overflowY: "auto" | "visible";
  } | null>(null);
  const [sheetMode, setSheetMode] = useState(() =>
    typeof window !== "undefined" ? shouldUseProfileOptionsSheet(window) : false,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const openedAtRef = useRef(0);

  useOverlayBackClose(
    menuOpen,
    () => setMenuOpen(false),
    "sayittome-profile-options-open",
    "sayittome:close-profile-options",
  );
  useOverlayBackClose(
    notificationsOpen,
    () => setNotificationsOpen(false),
    "sayittome-story-notification-settings-open",
    "sayittome:close-story-notification-settings",
  );

  useEffect(() => {
    const syncSheet = () => setSheetMode(shouldUseProfileOptionsSheet(window));
    syncSheet();
    window.addEventListener("resize", syncSheet);
    return () => window.removeEventListener("resize", syncSheet);
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen || sheetMode || !buttonRef.current) return;
    const syncMenu = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdown = dropdownRef.current;
      const box = measureMenuBox({
        scrollHeight: dropdown?.scrollHeight ?? 0,
        clientHeight: dropdown?.clientHeight ?? 0,
        boundingHeight: dropdown?.getBoundingClientRect().height ?? 0,
      });
      const measured = Math.max(box.intrinsicHeight, box.visibleHeight, 0);
      const fitted = fitAnchoredMenu({
        anchor: rect,
        viewport: readVisualViewportBox(window),
        menuWidth: dropdown?.offsetWidth || 288,
        estimatedHeight: measured || 128,
        measuredHeight: measured || 128,
        minVisibleCount: 2,
        itemHeight: 48,
        padding: 8,
        bottomReserve: readBottomUiReserve(document),
      });
      setMenuPos({
        top: fitted.top,
        right: fitted.right,
        maxHeight: fitted.maxHeight,
        overflowY: fitted.overflowY,
      });
    };
    const unlock = unlockDocumentFixedClip(document);
    syncMenu();
    requestAnimationFrame(syncMenu);
    window.addEventListener("resize", syncMenu);
    return () => {
      window.removeEventListener("resize", syncMenu);
      unlock();
    };
  }, [menuOpen, sheetMode]);

  if (!peerUid) return null;

  return (
    <>
      <div ref={rootRef} className={`relative ${className}`}>
        <button
          ref={buttonRef}
          type="button"
          data-profile-options-menu="1"
          data-profile-peer-options="1"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => {
              const next = !current;
              if (next) openedAtRef.current = Date.now();
              return next;
            });
          }}
          className="pointer-events-auto relative z-10 flex h-12 min-h-12 min-w-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
          aria-label={t("profile_options")}
          title={t("profile_options")}
        >
          <MoreHorizontal size={21} />
        </button>

        {menuOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                data-profile-options-layer="1"
                className="pointer-events-auto fixed inset-0 z-[1000001]"
              >
                <button
                  type="button"
                  className={sheetMode ? "absolute inset-0 bg-black/55" : "absolute inset-0 bg-transparent"}
                  aria-label={t("common_cancel")}
                  onClick={() => {
                    if (shouldIgnoreProfileOptionsDismiss(openedAtRef.current)) return;
                    setMenuOpen(false);
                  }}
                />
                <div
                  ref={dropdownRef}
                  data-profile-options-dropdown="1"
                  className={
                    sheetMode
                      ? "rounded-2xl border border-white/15 bg-zinc-950 p-2 shadow-2xl"
                      : "fixed z-[1000002] w-72 rounded-2xl border border-white/15 bg-zinc-950 p-2 shadow-2xl"
                  }
                  style={
                    sheetMode
                      ? getProfileOptionsSheetStyle()
                      : {
                          top: menuPos?.top ?? -9999,
                          right: menuPos?.right ?? 16,
                          maxHeight: menuPos?.maxHeight,
                          overflowY: menuPos?.overflowY ?? "visible",
                          visibility: menuPos ? "visible" : "hidden",
                        }
                  }
                >
                  <button
                    type="button"
                    data-profile-option="story-notifications"
                    onClick={() => {
                      setMenuOpen(false);
                      setNotificationsOpen(true);
                    }}
                    className="gap-3 rounded-xl text-sm font-bold text-white/85 hover:bg-white/5"
                    style={getProfileOptionsActionStyle()}
                  >
                    <Bell size={17} />
                    {t("story_notifications_menu")}
                  </button>
                  <button
                    type="button"
                    data-profile-option="report"
                    onClick={() => {
                      setMenuOpen(false);
                      setReportOpen(true);
                    }}
                    className="gap-3 rounded-xl text-sm font-bold text-amber-200 hover:bg-white/5"
                    style={getProfileOptionsActionStyle()}
                  >
                    <Flag size={17} />
                    {t("report_title")}
                  </button>
                </div>
              </div>,
              resolveProfileOptionsMenuPortalRoot(document) || document.body,
            )
          : null}
      </div>

      {notificationsOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-auto fixed inset-0 z-[1000002] flex items-center justify-center bg-black/85 px-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-4">
              <section className="pointer-events-auto flex max-h-[min(78dvh,680px)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-2xl">
                <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
                  <p className="text-lg font-black text-white">{t("story_notifications_label")}</p>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
                    aria-label={t("common_cancel")}
                  >
                    <X size={18} />
                  </button>
                </header>
                <div className="flex min-h-0 flex-1 flex-col p-5">
                  <StoryNotificationSettings
                    mode="peer"
                    peerUid={peerUid}
                    peerUsername={peerUsername}
                  />
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}

      <ContentReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        kind={"perfil" as ContentReportKind}
        targetUid={peerUid}
        targetUsername={peerUsername}
      />
    </>
  );
}
