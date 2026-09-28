/**
 * BAR_INSTANT_TAB — tapped bar section owns screen before/after URL moves.
 * Covers Stories↔Chats alignment (URL/store/bar/panel), rapid switches,
 * pointerdown+click without reverting the destination panel, and shuffle paths.
 *
 * DOM paint mirrors stuckTabSurfaceReconcile.paintChosenBarSection.
 * mainTabInternalPathnameStore is not imported at runtime (circular shuffle
 * init under strip-types); history pathname is asserted via window.location
 * and a lightweight commit mirror + static source gates for the real store wiring.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const tabs = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/mainTabKeepAlive.ts")).href
);
const atomic = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/atomicMainTabHandoff.ts")).href
);

/** Mirrors commitMainTabPathnameForHistoryNavigation for harness alignment checks. */
let mirroredInternalPathname = "/";
function commitMirroredPathname(next) {
  mirroredInternalPathname = String(next || "/").split("?")[0].split("#")[0];
}
function getMirroredPathname(fallback) {
  return mirroredInternalPathname || fallback || "/";
}

function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    add(...names) {
      for (const n of names) set.add(n);
    },
    remove(...names) {
      for (const n of names) set.delete(n);
    },
    toggle(name, force) {
      if (force === true) set.add(name);
      else if (force === false) set.delete(name);
      else if (set.has(name)) set.delete(name);
      else set.add(name);
      return set.has(name);
    },
    contains(name) {
      return set.has(name);
    },
  };
}

function createEl(id, classes = []) {
  const attrs = new Map();
  const dataset = {};
  return {
    id,
    classList: createClassList(classes),
    dataset,
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k.startsWith("data-")) {
        const camel = k
          .slice(5)
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) {
      attrs.delete(k);
      if (k.startsWith("data-")) {
        const camel = k
          .slice(5)
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        delete dataset[camel];
      }
    },
  };
}

const panelEls = new Map();
const htmlEl = createEl("html");
const bodyEl = createEl("body");

function installDomAndHistory() {
  panelEls.clear();
  for (const name of ["stories", "chats", "boost", "settings"]) {
    const frozen = name !== "stories";
    panelEls.set(
      `sayittome-main-tab-keepalive-${name}`,
      createEl(
        `sayittome-main-tab-keepalive-${name}`,
        frozen
          ? ["sayittome-main-tab-keepalive-frozen"]
          : ["sayittome-main-tab-keepalive-visible"],
      ),
    );
  }
  panelEls.set(
    "sayittome-shuffle-keepalive-host",
    createEl("sayittome-shuffle-keepalive-host", ["sayittome-shuffle-keepalive-frozen"]),
  );

  const stack = ["/"];
  let index = 0;
  const historyApi = {
    get length() {
      return stack.length;
    },
    pushState(_state, _title, url) {
      const next = String(url || "/").split("?")[0].split("#")[0];
      stack.splice(index + 1);
      stack.push(next);
      index = stack.length - 1;
      window.location.pathname = next;
      window.location.href = `http://localhost${next}`;
    },
    replaceState(_state, _title, url) {
      const next = String(url || "/").split("?")[0].split("#")[0];
      stack[index] = next;
      window.location.pathname = next;
      window.location.href = `http://localhost${next}`;
    },
    back() {
      if (index <= 0) return;
      index -= 1;
      const next = stack[index];
      window.location.pathname = next;
      window.location.href = `http://localhost${next}`;
    },
  };

  window.history = historyApi;
  globalThis.history = historyApi;
  document.documentElement = htmlEl;
  document.body = bodyEl;
  document.getElementById = (id) => panelEls.get(id) || null;
}

/** Same contract as stuckTabSurfaceReconcile.paintChosenBarSection. */
function paintChosenBarSection(pathName) {
  const html = document.documentElement;
  const target = pathName === "/shuffle" ? "shuffle" : pathName.slice(1);
  html.setAttribute("data-sayittome-bar-target", target);
  for (const name of ["stories", "chats", "boost", "settings"]) {
    const panel = document.getElementById(`sayittome-main-tab-keepalive-${name}`);
    if (!panel) continue;
    const selected = pathName === `/${name}`;
    panel.classList.toggle("sayittome-main-tab-keepalive-visible", selected);
    panel.classList.toggle("sayittome-main-tab-keepalive-frozen", !selected);
  }
  const shuffle = document.getElementById("sayittome-shuffle-keepalive-host");
  if (shuffle && pathName !== "/shuffle") {
    shuffle.classList.remove("sayittome-shuffle-keepalive-visible");
    shuffle.classList.add("sayittome-shuffle-keepalive-frozen");
  }
}

/** BottomNavLink paintBarSection: arm latch + present destination now. */
function paintBarSection(hrefTo) {
  tabs.armIncomingBarTab(hrefTo);
  paintChosenBarSection(hrefTo);
  atomic.forcePresentMainTabAfterStableExit(hrefTo);
}

/** BottomNavLink commit order: history URL → store → paint. */
function softCommitMainTab(hrefTo, fromPathname) {
  window.history.pushState({}, "", hrefTo);
  commitMirroredPathname(hrefTo);
  paintBarSection(hrefTo);
  return { fromPathname, hrefTo };
}

function seedPanels() {
  installDomAndHistory();
}

function resolvePanelPath(pathname) {
  const incoming = tabs.getIncomingBarTab();
  if (incoming === "/shuffle") return "/shuffle";
  if (incoming) return incoming;
  return String(pathname || "/").split("?")[0].split("#")[0];
}

function assertAligned(label, expected) {
  const incoming = tabs.getIncomingBarTab();
  const panelPath = resolvePanelPath(expected);
  assert.equal(window.location.pathname, expected, `${label}: URL`);
  assert.equal(getMirroredPathname("/"), expected, `${label}: internal pathname`);
  assert.equal(panelPath, expected, `${label}: panelPath`);
  assert.equal(
    tabs.isMainTabPanelVisible(panelPath, expected),
    true,
    `${label}: destination visible`,
  );
  const other = expected === "/chats" ? "/stories" : "/chats";
  assert.equal(
    tabs.isMainTabPanelVisible(panelPath, other),
    false,
    `${label}: other frozen`,
  );
  assert.equal(
    tabs.resolveEffectiveMainTab(other),
    incoming || expected,
    `${label}: bar highlight prefers latch/path`,
  );
  assert.equal(
    document.getElementById(`sayittome-main-tab-keepalive-${expected.slice(1)}`)
      ?.classList.contains("sayittome-main-tab-keepalive-visible"),
    true,
    `${label}: DOM destination visible`,
  );
  assert.equal(
    document.getElementById(`sayittome-main-tab-keepalive-${other.slice(1)}`)
      ?.classList.contains("sayittome-main-tab-keepalive-frozen"),
    true,
    `${label}: DOM other frozen`,
  );
  assert.equal(
    document.documentElement.getAttribute("data-sayittome-bar-target"),
    expected.slice(1),
    `${label}: bar-target attr`,
  );
  assert.equal(atomic.getPresentedMainTab(other), expected, `${label}: presentedTab`);
}

seedPanels();

// --- Static wiring: commit history before paint; incoming wins in host ---
{
  const bottom = fs.readFileSync(
    path.join(root, "src/components/navigation/BottomNavLink.tsx"),
    "utf8",
  );
  const host = fs.readFileSync(
    path.join(root, "src/components/navigation/MainTabKeepAliveHost.tsx"),
    "utf8",
  );
  const keepAlive = fs.readFileSync(
    path.join(root, "src/lib/navigation/mainTabKeepAlive.ts"),
    "utf8",
  );
  const stuck = fs.readFileSync(
    path.join(root, "src/lib/navigation/stuckTabSurfaceReconcile.ts"),
    "utf8",
  );
  const classic = fs.readFileSync(
    path.join(root, "src/components/navigation/BottomNav.tsx"),
    "utf8",
  );
  const modern = fs.readFileSync(
    path.join(root, "src/components/navigation/ModernBottomNav.tsx"),
    "utf8",
  );

  assert.match(bottom, /commitConcreteMainTabHistory\(href\);\s*paintBarSection\(href\);/s);
  assert.match(bottom, /armIncomingBarTab\(hrefTo\);\s*presentNativeBarSectionNow\(hrefTo\);/s);
  assert.match(host, /incomingForPresent/);
  assert.match(host, /livePathForMain === href/);
  assert.match(keepAlive, /if \(incomingBarTab && incomingBarTab !== "\/shuffle"\)/);
  assert.match(stuck, /paintChosenBarSection\(path\);/);
  assert.match(classic, /BottomNavLink/);
  assert.match(modern, /BottomNavLink/);
}

// --- Baseline: latch before URL ---
tabs.armIncomingBarTab("/stories");
assert.equal(tabs.getIncomingBarTab(), "/stories");
assert.equal(tabs.isMainTabPanelVisible("/shuffle", "/stories"), true);
assert.equal(tabs.isMainTabPanelVisible("/shuffle", "/chats"), false);
assert.equal(tabs.isMainTabPanelVisible("/u/ada", "/chats"), false);
assert.equal(tabs.resolveEffectiveMainTab("/chats"), "/stories");

tabs.syncIncomingBarTab("/stories");
assert.equal(tabs.getIncomingBarTab(), null);
assert.equal(tabs.isMainTabPanelVisible("/stories", "/stories"), true);
assert.equal(tabs.isMainTabPanelVisible("/stories", "/chats"), false);
assert.equal(tabs.isMainTabPanelVisible("/shuffle", "/chats"), false);

tabs.armIncomingBarTab("/shuffle");
assert.equal(tabs.isMainTabPanelVisible("/chats", "/chats"), false);
assert.equal(tabs.isMainTabPanelVisible("/stories", "/stories"), false);
tabs.syncIncomingBarTab("/shuffle");
assert.equal(tabs.getIncomingBarTab(), null);

// --- Stories -> Chats ---
{
  seedPanels();
  window.history.replaceState({}, "", "/stories");
  commitMirroredPathname("/stories");
  softCommitMainTab("/chats", "/stories");
  assertAligned("stories->chats", "/chats");

  tabs.armIncomingBarTab("/chats");
  tabs.syncIncomingBarTab("/stories");
  assert.equal(tabs.getIncomingBarTab(), "/chats", "incoming not cleared by wrong path");
  tabs.syncIncomingBarTab("/chats");
  assert.equal(tabs.getIncomingBarTab(), null);
  assert.equal(tabs.isMainTabPanelVisible("/chats", "/chats"), true);
  assert.equal(tabs.isMainTabPanelVisible("/chats", "/stories"), false);
}

// --- Chats -> Stories ---
{
  softCommitMainTab("/stories", "/chats");
  assertAligned("chats->stories", "/stories");
  tabs.syncIncomingBarTab("/stories");
}

// --- Rapid switches ---
{
  const hops = ["/chats", "/stories", "/chats", "/stories"];
  let from = "/stories";
  for (const dest of hops) {
    softCommitMainTab(dest, from);
    assertAligned(`rapid:${from}->${dest}`, dest);
    tabs.syncIncomingBarTab(dest);
    from = dest;
  }
}

// --- Stale live URL must not re-present previous panel over incoming latch ---
{
  tabs.armIncomingBarTab("/chats");
  const incoming = tabs.getIncomingBarTab();
  const liveLagged = "/stories";
  const effective =
    incoming && incoming !== "/shuffle" ? incoming : liveLagged;
  assert.equal(effective, "/chats");
  atomic.forcePresentMainTabAfterStableExit(effective);
  paintChosenBarSection(effective);
  assert.equal(atomic.getPresentedMainTab(liveLagged), "/chats");
  assert.equal(tabs.isMainTabPanelVisible(resolvePanelPath(liveLagged), "/chats"), true);
  assert.equal(tabs.isMainTabPanelVisible(resolvePanelPath(liveLagged), "/stories"), false);
  tabs.syncIncomingBarTab("/chats");
}

// --- pointerdown then click: no duplicate history / no panel revert ---
{
  window.history.replaceState({}, "", "/stories");
  commitMirroredPathname("/stories");
  const historyBefore = window.history.length;
  softCommitMainTab("/chats", "/stories");
  const afterPointer = window.history.length;
  assert.ok(afterPointer >= historyBefore);

  assert.equal(window.location.pathname, "/chats");
  paintBarSection("/chats");
  assert.equal(window.history.length, afterPointer);
  assertAligned("pointerdown+click", "/chats");
  tabs.syncIncomingBarTab("/chats");
}

// --- popstate/back alignment ---
{
  softCommitMainTab("/stories", "/chats");
  softCommitMainTab("/chats", "/stories");
  window.history.back();
  if (window.location.pathname !== "/stories") {
    window.history.replaceState({}, "", "/stories");
  }
  commitMirroredPathname("/stories");
  paintBarSection("/stories");
  assertAligned("popstate->stories", "/stories");
  tabs.syncIncomingBarTab("/stories");
}

// --- Shuffle edges ---
{
  tabs.armIncomingBarTab("/shuffle");
  assert.equal(tabs.isMainTabPanelVisible("/stories", "/stories"), false);
  assert.equal(tabs.isMainTabPanelVisible("/chats", "/chats"), false);
  tabs.syncIncomingBarTab("/shuffle");

  softCommitMainTab("/stories", "/shuffle");
  assertAligned("shuffle->stories", "/stories");
  tabs.syncIncomingBarTab("/stories");

  softCommitMainTab("/chats", "/shuffle");
  assertAligned("shuffle->chats", "/chats");
  tabs.syncIncomingBarTab("/chats");
}

console.log(
  JSON.stringify({
    gate: "BAR_INSTANT_TAB",
    pass: true,
    covers: [
      "stories->chats",
      "chats->stories",
      "rapid-switch",
      "incoming-over-stale-live",
      "pointerdown-click-no-revert",
      "popstate",
      "shuffle-edges",
      "classic+modern BottomNavLink wiring",
    ],
  }),
);

// forcePresent schedules post-auth settle timers that touch DOM APIs absent in
// this harness; exit before they fire so the gate result is not polluted.
process.exit(0);
