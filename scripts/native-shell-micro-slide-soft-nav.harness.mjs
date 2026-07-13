/**
 * NATIVE_SHELL_MICRO_SLIDE_SOFT_NAV_HARNESS
 * (extended for history commit mode on native shell)
 *
 * Validates computeCommitNavigationMode + force same-document commit decision.
 */
import assert from "node:assert/strict";
import {
  computeCommitNavigationMode,
  computeForceSoftNavigationForCommit,
} from "./main-tab-shuffle-commit-nav-mode.mjs";

const MODE_CASES = [
  {
    name: "LOCAL_BROWSER_NORMAL_flag_true",
    input: { href: "/shuffle", microSlideEnabled: true, nativeShellHardNavWouldApply: false },
    expectMode: "soft",
    expectReason: "micro-slide-soft-override",
    expectSoftOverride: true,
    expectHistoryOverride: false,
  },
  {
    name: "NATIVE_SHELL_AFTER_FIX_flag_true",
    input: { href: "/shuffle", microSlideEnabled: true, nativeShellHardNavWouldApply: true },
    expectMode: "history",
    expectReason: "micro-slide-history-override-native-shell",
    expectSoftOverride: false,
    expectHistoryOverride: true,
  },
  {
    name: "NATIVE_SHELL_flag_false",
    input: { href: "/shuffle", microSlideEnabled: false, nativeShellHardNavWouldApply: true },
    expectMode: "hard",
    expectReason: "native-shell-hard-nav",
    expectSoftOverride: false,
    expectHistoryOverride: false,
  },
  {
    name: "BROWSER_flag_false",
    input: { href: "/shuffle", microSlideEnabled: false, nativeShellHardNavWouldApply: false },
    expectMode: "soft",
    expectReason: "default-router-push",
    expectSoftOverride: false,
    expectHistoryOverride: false,
  },
  {
    name: "NATIVE_SHELL_non_shuffle_route_flag_true",
    input: { href: "/stories/new", microSlideEnabled: true, nativeShellHardNavWouldApply: true },
    expectMode: "hard",
    expectReason: "native-shell-hard-nav",
    expectSoftOverride: false,
    expectHistoryOverride: false,
  },
  {
    name: "CONTEXT_UNKNOWN_ssr",
    input: {
      href: "/shuffle",
      microSlideEnabled: true,
      nativeShellHardNavWouldApply: true,
      contextKnown: false,
    },
    expectMode: "unknown",
    expectReason: "context-unknown",
    expectSoftOverride: false,
    expectHistoryOverride: true,
  },
  {
    name: "REGRESSION_history_removed_native_shell_falls_back_soft",
    input: {
      href: "/shuffle",
      microSlideEnabled: true,
      nativeShellHardNavWouldApply: true,
      historyOverrideCapable: false,
      softOverrideCapable: true,
    },
    expectMode: "soft",
    expectReason: "micro-slide-soft-override-native-shell-fallback",
    expectSoftOverride: true,
    expectHistoryOverride: false,
  },
  {
    name: "REGRESSION_override_removed_native_shell",
    input: {
      href: "/shuffle",
      microSlideEnabled: true,
      nativeShellHardNavWouldApply: true,
      softOverrideCapable: false,
      historyOverrideCapable: false,
    },
    expectMode: "hard",
    expectReason: "native-shell-hard-nav",
    expectSoftOverride: false,
    expectHistoryOverride: false,
  },
  {
    name: "DIRECT_COLD_query_variant_native_shell",
    input: {
      href: "/shuffle?prod_single_hop=1",
      microSlideEnabled: true,
      nativeShellHardNavWouldApply: true,
    },
    expectMode: "history",
    expectReason: "micro-slide-history-override-native-shell",
    expectSoftOverride: false,
    expectHistoryOverride: true,
  },
];

const FORCE_CASES = [
  {
    name: "force_preparing_tx",
    input: { href: "/shuffle", microSlideEnabled: true, phase: "preparing", destination: "shuffle" },
    expect: true,
  },
  {
    name: "force_armed_tx",
    input: { href: "/shuffle", microSlideEnabled: true, phase: "armed", destination: "shuffle" },
    expect: true,
  },
  {
    name: "force_flag_true_no_tx",
    input: { href: "/shuffle", microSlideEnabled: true, phase: null, destination: null },
    expect: false,
  },
  {
    name: "force_flag_false_with_tx",
    input: { href: "/shuffle", microSlideEnabled: false, phase: "preparing", destination: "shuffle" },
    expect: false,
  },
  {
    name: "force_idle_phase",
    input: { href: "/shuffle", microSlideEnabled: true, phase: "idle", destination: "shuffle" },
    expect: false,
  },
  {
    name: "force_aborted_phase",
    input: { href: "/shuffle", microSlideEnabled: true, phase: "aborted", destination: "shuffle" },
    expect: false,
  },
  {
    name: "force_stale_tx",
    input: {
      href: "/shuffle",
      microSlideEnabled: true,
      phase: "preparing",
      destination: "shuffle",
      stale: true,
    },
    expect: false,
  },
  {
    name: "force_other_route",
    input: { href: "/stories", microSlideEnabled: true, phase: "preparing", destination: "shuffle" },
    expect: false,
  },
];

let pass = 0;
const total = 10_000;

for (let i = 0; i < total; i += 1) {
  const modeCase = MODE_CASES[i % MODE_CASES.length];
  const mode = computeCommitNavigationMode(modeCase.input);
  assert.equal(
    mode.effectiveCommitNavigationMode,
    modeCase.expectMode,
    `${modeCase.name} mode`,
  );
  assert.equal(mode.reason, modeCase.expectReason, `${modeCase.name} reason`);
  assert.equal(
    mode.microSlideSoftOverrideApplies,
    modeCase.expectSoftOverride,
    `${modeCase.name} softOverride`,
  );
  assert.equal(
    mode.microSlideHistoryOverrideApplies,
    modeCase.expectHistoryOverride,
    `${modeCase.name} historyOverride`,
  );

  if (mode.effectiveCommitNavigationMode === "history") {
    assert.equal(mode.historyNavigationToShuffleAvailable, true);
    assert.equal(mode.softNavigationToShuffleAvailable, false);
  }
  if (mode.effectiveCommitNavigationMode === "soft" && modeCase.expectSoftOverride) {
    assert.equal(mode.softNavigationToShuffleAvailable, true);
  }

  // Hard never chosen while history or soft micro-slide override applies (except unknown).
  if (
    modeCase.input.contextKnown !== false &&
    (mode.microSlideHistoryOverrideApplies || mode.microSlideSoftOverrideApplies)
  ) {
    assert.notEqual(mode.effectiveCommitNavigationMode, "hard", `${modeCase.name} not hard`);
  }

  const forceCase = FORCE_CASES[i % FORCE_CASES.length];
  const force = computeForceSoftNavigationForCommit(forceCase.input);
  assert.equal(force, forceCase.expect, `${forceCase.name} force`);

  pass += 1;
}

console.log(
  JSON.stringify(
    {
      harness: "NATIVE_SHELL_MICRO_SLIDE_SOFT_NAV_HARNESS",
      pass,
      total,
      ok: pass === total,
      HISTORY_COMMIT_ON_NATIVE_SHELL: true,
      HARD_NAVIGATION_BYPASSED_ONLY_FOR_ACTIVE_MICRO_SLIDE_COMMIT: true,
      NATIVE_HARD_NAV_UNCHANGED_OUTSIDE_MICRO_SLIDE: true,
    },
    null,
    2,
  ),
);

assert.equal(pass, total);
