"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { explainChatsInboxSkeleton } from "@/hooks/useChatsInboxReady";
import { resolveEffectiveMainTab } from "@/lib/navigation/mainTabKeepAlive";
import {
  peekFirstInboxSnapshotReadMeta,
  readInboxSnapshotWithMeta,
  resetInboxSnapshotReadTrace,
} from "@/lib/chat/inboxSnapshot";
import {
  chatsPipelineBegin,
  chatsPipelineMark,
} from "@/lib/perf/chatsPipelineTrace";
import {
  isNavTraceEnabled,
  navTraceCommit,
  navTraceFinish,
  navTraceMark,
  navTraceMarkDetail,
  navTraceMarkPaint,
} from "@/lib/perf/navTrace";

function observeChatsPrimaryDom() {
  if (!isNavTraceEnabled() || typeof document === "undefined") return () => {};

  const selector = "[data-nav-chats-primary]";
  const mark = () => {
    navTraceMarkDetail("dom-main-visible");
    chatsPipelineMark("inbox-primary-dom");
  };

  if (document.querySelector(selector)) {
    mark();
    return () => {};
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector(selector)) {
      mark();
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}

type InboxPaintInput = {
  loading: boolean;
  sortedChats: readonly unknown[];
  firestoreHydrated?: boolean;
};

export function useChatsTabPaint(inbox: InboxPaintInput) {
  const pathname = usePathname();
  const effectiveTab = resolveEffectiveMainTab(pathname);
  const gate = explainChatsInboxSkeleton(inbox);
  const onChatsRoute = effectiveTab === "/chats";
  const hasListContent = inbox.sortedChats.length > 0;

  useLayoutEffect(() => {
    if (!onChatsRoute) {
      resetInboxSnapshotReadTrace();
      return;
    }
    chatsPipelineBegin();
    chatsPipelineMark("chats-mount");

    const current = readInboxSnapshotWithMeta().meta;
    const first = peekFirstInboxSnapshotReadMeta();
    const meta =
      first?.source === "session" && current.source === "memory" ? first : current;
    chatsPipelineMark("snapshot-read-start");
    if (meta.source === "memory") {
      chatsPipelineMark("inbox-memory-hit", {
        snapshotCount: meta.count,
        snapshotBytes: meta.bytes,
        snapshotParseMs: meta.parseMs,
      });
      chatsPipelineMark("snapshot-accepted", {
        snapshotCount: meta.count,
        snapshotBytes: meta.bytes,
        snapshotParseMs: meta.parseMs,
      });
    } else if (meta.source === "session") {
      chatsPipelineMark("inbox-memory-miss");
      chatsPipelineMark("snapshot-parsed", {
        snapshotCount: meta.count,
        snapshotBytes: meta.bytes,
        snapshotParseMs: meta.parseMs,
      });
      chatsPipelineMark(meta.accepted ? "snapshot-accepted" : "snapshot-rejected", {
        snapshotCount: meta.count,
        snapshotBytes: meta.bytes,
        snapshotParseMs: meta.parseMs,
      });
    } else {
      chatsPipelineMark("inbox-memory-miss");
      chatsPipelineMark("snapshot-rejected");
    }
  }, [onChatsRoute]);

  useLayoutEffect(() => {
    if (!isNavTraceEnabled() || !onChatsRoute) return;

    navTraceMarkDetail(`skeleton-gate-${gate.show ? "true" : "false"}`);
    navTraceMarkDetail(`skeleton-reason-${gate.reason}`);

    if (gate.show) {
      chatsPipelineMark("skeleton-gate-true", { skeletonReason: gate.reason });
      return;
    }

    chatsPipelineMark("skeleton-gate-false", { skeletonReason: gate.reason });
  }, [gate.show, gate.reason, onChatsRoute]);

  useLayoutEffect(() => {
    if (!isNavTraceEnabled() || !onChatsRoute || gate.show) return;

    const stopObserving = observeChatsPrimaryDom();
    navTraceMarkPaint("shell-paint");
    chatsPipelineMark("shell-paint");

    if (hasListContent) {
      navTraceMarkPaint("stale-useful-paint");
      chatsPipelineMark("stale-useful-paint");
      navTraceMark("dest-layout");
      navTraceCommit();
      navTraceFinish(undefined, "useful-paint");
    }

    return stopObserving;
  }, [gate.show, hasListContent, onChatsRoute]);

  useLayoutEffect(() => {
    if (!isNavTraceEnabled() || !onChatsRoute || gate.show) return;
    if (!inbox.firestoreHydrated || !hasListContent) return;

    navTraceMarkPaint("fresh-network-paint");
    chatsPipelineMark("fresh-network-paint");
  }, [gate.show, hasListContent, inbox.firestoreHydrated, onChatsRoute]);
}
