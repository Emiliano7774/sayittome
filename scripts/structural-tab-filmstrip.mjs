/**
 * Structural tab transition filmstrip — classifies frames by DOM state, not pixel diff.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://sayittome-app.web.app";

const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join("scripts", "ghost-filmstrip-out", `structural-tabs-${Date.now()}`);

const storagePath = "scripts/bench-storage-state.json";
const TRANSITIONS = [
  ["shuffle", "stories"],
  ["stories", "chats"],
  ["chats", "boost"],
  ["boost", "settings"],
  ["settings", "stories"],
];

const TAB_PATH = {
  shuffle: "/shuffle",
  stories: "/stories",
  chats: "/chats",
  boost: "/boost",
  settings: "/settings",
};

async function clickNavTab(page, tabKey) {
  await page.evaluate((key) => {
    const el = document.querySelector(`[data-nav-tab="${key}"]`);
    el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    if (el && "click" in el && typeof el.click === "function") el.click();
  }, tabKey);
}

async function sampleStructural(page) {
  return page.evaluate(() => {
    function panel(id) {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        exists: true,
        visibleClass: el.classList.contains("sayittome-main-tab-keepalive-visible"),
        frozenClass: el.classList.contains("sayittome-main-tab-keepalive-frozen"),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        zIndex: cs.zIndex,
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        primary: Boolean(el.querySelector("[data-nav-primary-content]")),
        loading: /Cargando\.\.\.|Loading\.\.\./i.test(el.textContent?.slice(0, 300) ?? ""),
      };
    }

    const shuffle = document.getElementById("sayittome-shuffle-keepalive-host");
    const shuffleCs = shuffle ? getComputedStyle(shuffle) : null;

    return {
      pathname: location.pathname,
      htmlClasses: [...document.documentElement.classList].filter((c) => c.startsWith("sayittome-")),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      panels: {
        stories: panel("sayittome-main-tab-keepalive-stories"),
        chats: panel("sayittome-main-tab-keepalive-chats"),
        boost: panel("sayittome-main-tab-keepalive-boost"),
        settings: panel("sayittome-main-tab-keepalive-settings"),
      },
      shuffle: shuffle
        ? {
            visible: shuffle.classList.contains("sayittome-shuffle-keepalive-visible"),
            frozen: shuffle.classList.contains("sayittome-shuffle-keepalive-frozen"),
            visibility: shuffleCs?.visibility,
            opacity: shuffleCs?.opacity,
            zIndex: shuffleCs?.zIndex,
            loading: /Cargando\.\.\.|Loading\.\.\./i.test(shuffle.textContent?.slice(0, 300) ?? ""),
          }
        : null,
      handoff: {
        mainTabPending: document.documentElement.classList.contains("sayittome-main-tab-handoff-pending"),
        shuffleExitPending: document.documentElement.classList.contains("sayittome-shuffle-exit-handoff-pending"),
        source: document.documentElement.dataset.sayittomeMainTabHandoffSource ?? null,
      },
    };
  });
}

function classifyStructural(geo, fromKey, toKey) {
  const fromHost =
    fromKey === "shuffle"
      ? geo.shuffle?.visible
      : geo.panels[fromKey]?.visibleClass;
  const toHost =
    toKey === "shuffle" ? geo.shuffle?.visible : geo.panels[toKey]?.visibleClass;

  const fromPrimary =
    fromKey === "shuffle"
      ? Boolean(geo.shuffle?.visible)
      : geo.panels[fromKey]?.primary;
  const toPrimary =
    toKey === "shuffle" ? Boolean(geo.shuffle?.visible) : geo.panels[toKey]?.primary;

  const presentedPanel = geo.panels[fromKey];
  const destPanel = geo.panels[toKey];
  const fromLoading =
    fromKey === "shuffle"
      ? Boolean(geo.shuffle?.loading)
      : Boolean(presentedPanel?.loading && presentedPanel?.visibleClass);
  const toLoading =
    toKey === "shuffle"
      ? Boolean(geo.shuffle?.loading)
      : Boolean(destPanel?.loading && destPanel?.visibleClass);

  const visiblePanels = Object.entries(geo.panels).filter(([, p]) => p?.visibleClass).map(([k]) => k);
  const presentedCount =
    visiblePanels.length + (geo.shuffle?.visible ? 1 : 0);

  if (fromHost && fromPrimary && !toHost) return "SOURCE_VALID";
  if (toHost && toPrimary && !fromHost) return "DEST_VALID";
  if (fromHost && toHost) return "SOURCE_DEST_OVERLAP";
  if (fromLoading || toLoading) return "LOADING";
  if (presentedCount === 0) return "BLANK_ROOT";
  if (toHost && !toPrimary) return "DEST_PARTIAL";
  return "OTHER_TRANSIENT";
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const storage = fs.existsSync(storagePath) ? storagePath : undefined;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...(storage ? { storageState: storage } : {}),
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const summary = [];

  try {
    await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2000);

    for (const [fromKey, toKey] of TRANSITIONS) {
      const fromPath = TAB_PATH[fromKey];
      const toPath = TAB_PATH[toKey];
      const tOut = path.join(outDir, `${fromKey}-${toKey}`);
      fs.mkdirSync(tOut, { recursive: true });

      if (fromKey !== "shuffle") {
        await clickNavTab(page, fromKey);
        await page.waitForURL(new RegExp(fromPath.replace("/", "\\/")), { timeout: 15000 }).catch(() => {});
      } else {
        await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded" });
      }
      await page.waitForTimeout(1200);

      const frames = [];
      let seq = 0;
      cdp.on("Page.screencastFrame", async (params) => {
        if (seq >= 40) return;
        const idx = seq++;
        const geometry = await sampleStructural(page).catch(() => null);
        frames[idx] = {
          index: idx,
          buffer: Buffer.from(params.data, "base64"),
          geometry,
          classification: classifyStructural(geometry ?? { panels: {} }, fromKey, toKey),
        };
        try {
          await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
        } catch {
          /* ended */
        }
      });

      await cdp.send("Page.startScreencast", { format: "png", quality: 88, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
      await clickNavTab(page, toKey);
      await page.waitForTimeout(1000);
      try {
        await cdp.send("Page.stopScreencast");
      } catch {
        /* ignore */
      }
      cdp.removeAllListeners("Page.screencastFrame");

      const analysis = frames.filter(Boolean);
      const architecturalTransientFrameCount = analysis.filter((f) =>
        !["SOURCE_VALID", "DEST_VALID"].includes(f.classification),
      ).length;

      for (const f of analysis) {
        fs.writeFileSync(path.join(tOut, `frame-${String(f.index).padStart(2, "0")}.png`), f.buffer);
      }

      const report = { from: fromKey, to: toKey, architecturalTransientFrameCount, analysis };
      fs.writeFileSync(path.join(tOut, "report.json"), JSON.stringify(report, null, 2));
      summary.push({ transition: `${fromKey}-${toKey}`, architecturalTransientFrameCount });
      console.log(JSON.stringify(report, null, 2));
    }

    const batch = {
      base,
      summary,
      totalArchitecturalTransientFrameCount: summary.reduce((n, r) => n + r.architecturalTransientFrameCount, 0),
    };
    fs.writeFileSync(path.join(outDir, "batch-report.json"), JSON.stringify(batch, null, 2));
    console.log("\n=== BATCH ===\n", JSON.stringify(batch, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
