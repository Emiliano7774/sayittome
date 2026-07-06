"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import {
  settingsPipelineBegin,
  settingsPipelineMark,
} from "@/lib/perf/settingsPipelineTrace";
import {
  isNavTraceEnabled,
  navTraceCommit,
  navTraceFinish,
  navTraceMark,
  navTraceMarkDetail,
} from "@/lib/perf/navTrace";

const SETTINGS_PROFILE_CACHE_KEY = "sayittome:settings-self-profile:v1";

function readSettingsCacheMeta() {
  if (typeof window === "undefined") {
    return { profile: null, parseMs: 0, bytes: 0 };
  }
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_PROFILE_CACHE_KEY);
    if (!raw) return { profile: null, parseMs: 0, bytes: 0 };
    const bytes = raw.length * 2;
    const parseStart = performance.now();
    const profile = JSON.parse(raw);
    return { profile, parseMs: Math.round(performance.now() - parseStart), bytes };
  } catch {
    return { profile: null, parseMs: 0, bytes: 0 };
  }
}

type SettingsPaintInput = {
  loading: boolean;
  profile: unknown;
  showAnonGate: boolean;
  authKnown: boolean;
};

export function useSettingsTabPaint(input: SettingsPaintInput) {
  const pathname = usePathname();
  const onSettings = pathname === "/settings";
  const ready = !input.loading && (Boolean(input.profile) || input.showAnonGate);

  useLayoutEffect(() => {
    if (!onSettings) return;
    settingsPipelineBegin();
    settingsPipelineMark("settings-mount");

    const cached = readSettingsCacheMeta();
    settingsPipelineMark("session-read-start");
    if (cached.profile) {
      settingsPipelineMark("session-parsed", {
        sessionBytes: cached.bytes,
        sessionParseMs: cached.parseMs,
      });
      settingsPipelineMark("session-hit");
    } else {
      settingsPipelineMark("session-miss");
    }
  }, [onSettings]);

  useLayoutEffect(() => {
    if (!isNavTraceEnabled() || !onSettings) return;
    if (input.authKnown) {
      settingsPipelineMark("auth-known");
    } else {
      settingsPipelineMark("auth-unknown");
    }
    if (input.showAnonGate) {
      settingsPipelineMark("anon-gate-true");
    } else {
      settingsPipelineMark("anon-gate-false");
    }
    if (!input.loading) {
      settingsPipelineMark("loading-false");
    }
  }, [input.authKnown, input.showAnonGate, input.loading, onSettings]);

  useLayoutEffect(() => {
    if (!isNavTraceEnabled() || !onSettings || !ready) return;

    const el = document.querySelector("[data-nav-settings-primary]");
    if (el) {
      navTraceMarkDetail("dom-main-visible");
      settingsPipelineMark("settings-primary-dom");
    }

    settingsPipelineMark("useful-paint");
    navTraceMark("dest-layout");
    navTraceCommit();
    navTraceFinish(undefined, "useful-paint");
  }, [ready, onSettings]);
}

export { readSettingsCacheMeta, SETTINGS_PROFILE_CACHE_KEY };
