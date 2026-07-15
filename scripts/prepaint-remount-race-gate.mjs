/**
 * Controlled prepaint remount race gate — forces session marker + hard remount
 * and samples loading visibility immediately after navigation.
 * Usage: node scripts/prepaint-remount-race-gate.mjs --base http://127.0.0.1:3010 --repeat 10
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";
const repeat = Math.max(1, Number(args[args.indexOf("--repeat") + 1] || 10) || 10);

const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() =>
  chromium.launch({ headless: true }),
);

const results = [];
for (let i = 0; i < repeat; i++) {
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
  await page.waitForTimeout(600);
  const pre = await page.evaluate(() => {
    const until = Date.now() + 3000;
    const marker = {
      destination: "/chats",
      from: "/shuffle",
      txId: `race-${Date.now()}`,
      startedAt: Date.now(),
      expiresAt: until,
    };
    sessionStorage.setItem("sayittome:chats-prepaint-handoff", JSON.stringify(marker));
    sessionStorage.setItem(
      "sayittome:chats-sequence-handoff-suppress-until",
      String(until),
    );
    document.documentElement.dataset.prepaintChatsHandoffSuppress = "1";
    document.documentElement.dataset.chatsHandoffSuppress = "1";
    return {
      markerWritten: true,
      exportPresent: typeof window.__microSlideActivationExport === "function",
    };
  });
  await page.goto(`${base}/chats?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "commit",
    timeout: 90_000,
  });
  const early = await page.evaluate(() => {
    const LOADING_RE = /Cargando\.\.\.|Loading\.\.\./i;
    const visibleLoading = [
      ...document.querySelectorAll("[data-nav-loading-copy], [data-nav-chats-loading]"),
    ].some((el) => {
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
      prepaint:
        document.documentElement.getAttribute("data-prepaint-chats-handoff-suppress") ===
          "1" ||
        document.documentElement.getAttribute("data-chats-handoff-suppress") === "1",
      marker: !!sessionStorage.getItem("sayittome:chats-prepaint-handoff"),
      visibleLoading,
      exportPresent: typeof window.__microSlideActivationExport === "function",
    };
  });
  await page.waitForTimeout(800);
  const final = await page.evaluate(() => {
    const LOADING_RE = /Cargando\.\.\.|Loading\.\.\./i;
    const visibleLoading = [
      ...document.querySelectorAll("[data-nav-loading-copy], [data-nav-chats-loading]"),
    ].some((el) => {
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
      suppress:
        document.documentElement.getAttribute("data-chats-handoff-suppress") === "1" ||
        document.documentElement.getAttribute("data-chats-handoff-suppress-rehydrated") ===
          "1",
      visibleLoading,
      exportPresent: typeof window.__microSlideActivationExport === "function",
    };
  });
  const pass =
    pre.markerWritten &&
    early.pathname === "/chats" &&
    early.prepaint === true &&
    early.visibleLoading === false &&
    final.visibleLoading === false;
  results.push({ i, pass, pre, early, final });
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass).length;
const out = {
  harness: "PREPAINT_REMOUNT_RACE_GATE",
  pass: failed === 0,
  repeat,
  failed,
  results,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed === 0 ? 0 : 1);
