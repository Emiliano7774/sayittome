import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3012";
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "";
const profilePath = args.includes("--profile-path")
  ? args[args.indexOf("--profile-path") + 1]
  : "/u/Santi000_35";

const browser = await chromium
  .launch({ channel: "chrome", headless: true })
  .catch(() => chromium.launch({ headless: true }));
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
});
const page = await context.newPage();
const checks = [];
const check = (name, pass, detail = {}) => {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
};

async function overlayState(route) {
  await page.goto(`${base}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page
    .locator('[data-qa-debug-overlay="1"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-qa-debug-overlay="1"]');
    const copy = document.querySelector('[data-qa-debug-copy="1"]');
    return {
      path: location.pathname,
      overlayVisible: Boolean(
        overlay &&
          getComputedStyle(overlay).display !== "none" &&
          overlay.getBoundingClientRect().width > 8,
      ),
      copyVisible: Boolean(
        copy &&
          getComputedStyle(copy).display !== "none" &&
          copy.getBoundingClientRect().height > 8,
      ),
    };
  });
}

for (const route of [
  "/?qaDebug=1",
  `${profilePath}?qaDebug=1`,
  "/shuffle?qaDebug=1",
  "/chats?qaDebug=1",
]) {
  const state = await overlayState(route);
  check(`QADEBUG_GLOBAL_${state.path || "ROOT"}`, state.overlayVisible && state.copyVisible, state);
}
await page.locator('[data-qa-debug-copy="1"]').click();
await page.waitForTimeout(200);
check(
  "QADEBUG_COPY_BUTTON_WORKS",
  (await page.locator('[data-qa-debug-copy="1"]').textContent()) === "Copied",
);

await overlayState("/?qaDebug=1");
await page.goto(`${base}${profilePath}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.waitForTimeout(800);
check(
  "QADEBUG_SURVIVES_ROUTE_WITHOUT_QUERY",
  (await page.locator('[data-qa-debug-overlay="1"]').count()) === 1,
);

await overlayState("/shuffle?qaDebug=1");
await page.waitForTimeout(600);
await page.evaluate(() => {
  const host = document.getElementById("sayittome-shuffle-keepalive-host");
  if (host) host.replaceChildren();
});
await page
  .locator('[data-shuffle-global-safety="1"]')
  .waitFor({ state: "visible", timeout: 3_000 })
  .catch(() => null);
const blankRecovery = await page.evaluate(() => {
  const shell = document.querySelector('[data-shuffle-global-safety="1"]');
  const nav = document.querySelector(".sayittome-bottom-nav");
  return {
    shellVisible: Boolean(
      shell &&
        getComputedStyle(shell).visibility !== "hidden" &&
        shell.getBoundingClientRect().height > 100 &&
        /Shuffle/.test(shell.textContent || ""),
    ),
    bottomNavPresent: Boolean(nav),
  };
});
check(
  "FORCED_BLANK_RECOVERS_VISIBLE_SHUFFLE_SHELL",
  blankRecovery.shellVisible && blankRecovery.bottomNavPresent,
  blankRecovery,
);

await overlayState("/shuffle?qaDebug=1&qaShuffleThrow=1");
await page
  .locator('[data-shuffle-error-shell="1"]')
  .waitFor({ state: "visible", timeout: 10_000 })
  .catch(() => null);
const boundary = await page.evaluate(() => {
  const shell = document.querySelector('[data-shuffle-error-shell="1"]');
  return {
    visible: Boolean(
      shell &&
        shell.getBoundingClientRect().height > 100 &&
        /Shuffle/.test(shell.textContent || ""),
    ),
  };
});
check("RUNTIME_ERROR_SHOWS_VISIBLE_SHUFFLE_BOUNDARY", boundary.visible, boundary);

await browser.close();
const report = {
  gate: "MANUAL_QA4_REALDEVICE_EVIDENCE",
  pass: checks.every((item) => item.pass),
  base,
  checks,
};
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
