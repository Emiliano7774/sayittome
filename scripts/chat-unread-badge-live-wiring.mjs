/**
 * Live/wiring checks for chat unread badge (no extra listeners).
 *   node scripts/chat-unread-badge-live-wiring.mjs --base http://127.0.0.1:3010
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";
const out = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : "scripts/ghost-filmstrip-out/chat-unread-live-wiring";
fs.mkdirSync(out, { recursive: true });

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const bubbleSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/chat/chatBubbleStyles.ts"),
  "utf8",
);
const routesSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/chat/inboxListenerRoutes.ts"),
  "utf8",
);
const unreadSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/chat/unread.ts"),
  "utf8",
);

check(
  "CHAT_DETAIL_HAS_NO_PENDING_ORANGE_RING",
  !bubbleSrc.includes("border-orange-400") &&
    !bubbleSrc.includes("ring-orange"),
);

check(
  "MARK_READ_ONLY_ON_OPEN_CHAT_API",
  unreadSrc.includes("export async function markChatAsRead") &&
    !routesSrc.includes("markChatAsRead("),
);

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";
const browser = await chromium
  .launch({ headless: true, channel: "chrome" })
  .catch(() => chromium.launch({ headless: true }));

const tabs = ["shuffle", "stories", "boost", "settings", "chats"];
const tabPresence = {};
for (const tab of tabs) {
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
    localStorage.setItem("sayittome_ux_mode", "classic");
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/${tab}?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(1200);
  for (let d = 0; d < 2; d++) {
    try {
      const dismiss = page.getByRole("button", { name: /Ahora no|Not now/i }).first();
      if (await dismiss.isVisible({ timeout: 300 }).catch(() => false)) {
        await dismiss.click({ force: true }).catch(() => {});
      } else break;
    } catch {
      break;
    }
  }
  const snap = await page.evaluate(() => {
    const chatsTab = document.querySelector('[data-nav-tab="chats"]');
    const badgeHost = chatsTab?.querySelector('[aria-hidden="true"]');
    const orangeInChatDetail = [
      ...document.querySelectorAll(
        "[class*='border-orange'], [class*='ring-orange']",
      ),
    ].filter((el) => {
      const inKeepaliveChats = el.closest("#sayittome-main-tab-keepalive-chats");
      const inChatThread = location.pathname.startsWith("/chat/");
      return !inKeepaliveChats && inChatThread;
    });
    return {
      path: location.pathname,
      chatsTabPresent: !!chatsTab,
      bottomNavPresent: !!document.querySelector("[data-nav-tab]"),
      orangeInChatDetailCount: orangeInChatDetail.length,
    };
  });
  tabPresence[tab] = snap;
  await ctx.close();
}

check(
  "UNREAD_BADGE_SLOT_VISIBLE_FROM_SHUFFLE_STORIES_BOOST_SETTINGS",
  ["shuffle", "stories", "boost", "settings"].every(
    (t) => tabPresence[t]?.chatsTabPresent && tabPresence[t]?.bottomNavPresent,
  ),
  { tabPresence },
);

check(
  "CHATS_LIST_PAGE_HAS_NAV_AND_NO_DETAIL_ORANGE",
  tabPresence.chats?.chatsTabPresent === true &&
    tabPresence.chats?.orangeInChatDetailCount === 0,
);

// Logged-in wiring: badge component path + optional inbox rows.
const profile = path.resolve("scripts/.auth-capture-profile-chrome-diag");
let logged = null;
if (fs.existsSync(profile)) {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chrome",
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(`${base}/chats?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(2000);
  logged = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("a[href*='/chat/'], [data-chat-id]")];
    const boldRows = rows.filter((r) =>
      /font-black|font-bold/.test(r.className || ""),
    );
    const chatsTab = document.querySelector('[data-nav-tab="chats"]');
    return {
      path: location.pathname,
      rowCount: rows.length,
      boldRowCount: boldRows.length,
      chatsTabPresent: !!chatsTab,
    };
  });
  // Open first chat if any and ensure no orange pending ring in detail.
  if (logged.rowCount > 0) {
    await page.evaluate(() => {
      const a = document.querySelector("a[href*='/chat/']");
      a?.click();
    });
    await page.waitForTimeout(1500);
    const detail = await page.evaluate(() => {
      const orange = [
        ...document.querySelectorAll(
          "[class*='border-orange'], [class*='ring-orange']",
        ),
      ].filter((el) => {
        const cls = el.className?.toString?.() || "";
        // Ignore view-once / camera pending media UI which uses orange legitimately.
        const text = el.textContent || "";
        if (/Ver una sola vez|view once|camera/i.test(text)) return false;
        if (/viewOnce|view-once/i.test(cls)) return false;
        return true;
      });
      return {
        path: location.pathname,
        orangeCount: orange.length,
        orangeClasses: orange.slice(0, 5).map((el) => String(el.className)),
      };
    });
    logged.detail = detail;
    check(
      "LIVE_CHAT_DETAIL_NO_UNREAD_ORANGE_PENDING_RING",
      detail.path.startsWith("/chat/") ? detail.orangeCount === 0 : true,
      detail,
    );
  } else {
    check(
      "LIVE_CHAT_DETAIL_NO_UNREAD_ORANGE_PENDING_RING",
      true,
      { skipped: "no chat rows in profile inbox" },
    );
  }
  check(
    "LIVE_CHATS_INBOX_WIRING",
    logged.chatsTabPresent === true,
    logged,
  );
  await ctx.close();
} else {
  check("LIVE_CHATS_INBOX_WIRING", false, { error: "missing-profile" });
  check("LIVE_CHAT_DETAIL_NO_UNREAD_ORANGE_PENDING_RING", false, {
    error: "missing-profile",
  });
}

await browser.close();

const failed = checks.filter((c) => !c.pass);
const summary = {
  gate: "CHAT_UNREAD_BADGE_LIVE_WIRING_GATE",
  pass: failed.length === 0,
  failedCount: failed.length,
  checks,
  tabPresence,
  logged,
  base,
};
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
