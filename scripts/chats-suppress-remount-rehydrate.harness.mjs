/**
 * SoftNavigate remount parity: session-persisted Chats suppress must hide
 * Cargando... after a hard navigation to /chats (simulates context destroy).
 */
import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";

const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() =>
  chromium.launch({ headless: true }),
);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await context.addInitScript(() => {
  try {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
    localStorage.setItem("sayittome:nav-capture", "1");
    sessionStorage.setItem("sayittome:nav-capture-session", "1");
  } catch {
    /* ignore */
  }
});

const page = await context.newPage();
await page.goto(`${base}/shuffle?navcapture=1&_bd=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 90_000,
});
await page.waitForTimeout(1200);

const pre = await page.evaluate(() => {
  const act = window.__microSlideActivationExport?.() ?? null;
  return {
    exportPresent: typeof window.__microSlideActivationExport === "function",
    runtimeFlag: act?.microSlideRuntimeEnabled === true,
  };
});
if (!pre.exportPresent || !pre.runtimeFlag) {
  console.log(
    JSON.stringify({
      pass: false,
      reason: "pre-input-flag-missing",
      pre,
    }),
  );
  await browser.close();
  process.exit(1);
}

// Arm suppress + prepaint marker as SoftNavigate would, then hard-nav to /chats (remount).
await page.evaluate(() => {
  const until = Date.now() + 8000;
  sessionStorage.setItem("sayittome:chats-sequence-handoff-suppress-until", String(until));
  sessionStorage.setItem("sayittome:chats-sequence-handoff-suppress-tx", "remount-stress");
  sessionStorage.setItem(
    "sayittome:chats-prepaint-handoff",
    JSON.stringify({
      destination: "/chats",
      from: "/shuffle",
      txId: "remount-stress",
      startedAt: Date.now(),
      expiresAt: until,
    }),
  );
  document.documentElement.dataset.chatsHandoffSuppress = "1";
  document.documentElement.dataset.prepaintChatsHandoffSuppress = "1";
});
await page.goto(`${base}/chats?navcapture=1&_bd=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 90_000,
});
await page.waitForTimeout(600);

const mid = await page.evaluate(() => {
  const LOADING_RE = /Cargando\.\.\.|Loading\.\.\./i;
  const host = document.getElementById("sayittome-main-tab-keepalive-chats");
  const text = host?.textContent || document.body.textContent || "";
  const visibleLoading = [...document.querySelectorAll("[data-nav-loading-copy], [data-nav-chats-loading]")]
    .some((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        LOADING_RE.test(el.textContent || "") &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        parseFloat(cs.opacity) >= 0.04 &&
        r.width > 2 &&
        r.height > 2
      );
    });
  return {
    pathname: location.pathname,
    suppressAttr: document.documentElement.getAttribute("data-chats-handoff-suppress"),
    rehydrated: document.documentElement.getAttribute("data-chats-handoff-suppress-rehydrated"),
    sessionUntil: sessionStorage.getItem("sayittome:chats-sequence-handoff-suppress-until"),
    visibleLoading,
    textHasCargando: LOADING_RE.test(text.slice(0, 4000)),
    exportPresent: typeof window.__microSlideActivationExport === "function",
    runtimeFlag: window.__microSlideActivationExport?.()?.microSlideRuntimeEnabled === true,
  };
});

const pass =
  mid.pathname === "/chats" &&
  mid.suppressAttr === "1" &&
  mid.visibleLoading === false &&
  mid.exportPresent === true &&
  mid.runtimeFlag === true;

console.log(
  JSON.stringify(
    {
      harness: "CHATS_SUPPRESS_REMOUNT_SESSION_REHYDRATE",
      pass,
      pre,
      mid,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(pass ? 0 : 1);
