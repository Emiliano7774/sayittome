import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const base = value("--base", "");
const out = value("--out", "");
if (!base) throw new Error("--base is required");

async function probe(route) {
  const response = await fetch(`${base}${route}`, { redirect: "manual" });
  const text = await response.text();
  return {
    route,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    length: text.length,
    text,
  };
}

const [rootProbe, loginProbe, shuffleApiProbe] = await Promise.all([
  probe("/"),
  probe("/login"),
  probe("/api/shuffle?pool=full&shuffle=1"),
]);

let shuffleJson = null;
try {
  shuffleJson = JSON.parse(shuffleApiProbe.text);
} catch {
  shuffleJson = null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  serviceWorkers: "block",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto(`${base}/?qaDebug=1`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.evaluate(() => {
  localStorage.setItem("sayittome_locale_prompt_done", "1");
  localStorage.setItem(
    "sayittome-chat-notification-prefs",
    JSON.stringify({ enabled: false, prompted: true }),
  );
});
await page.reload({ waitUntil: "domcontentloaded" });
await page
  .locator("[data-qa-debug-overlay='1']")
  .waitFor({ state: "visible", timeout: 10_000 })
  .catch(() => undefined);
const qaDebugRootVisible =
  (await page.locator("[data-qa-debug-overlay='1']").count()) === 1;
const loginLink = page.locator('main a[href="/login"]').last();
const loginLinkVisible = await loginLink.isVisible().catch(() => false);
if (loginLinkVisible) {
  await loginLink.click();
}
await page.waitForURL((url) => url.pathname === "/login", { timeout: 10_000 });
await page
  .locator('form input[type="email"]')
  .waitFor({ state: "visible", timeout: 12_000 })
  .catch(() => undefined);
const loginFormVisible = await page
  .locator('form input[type="email"]')
  .isVisible()
  .catch(() => false);
const loginButtonVisible = await page
  .locator('form button:not([type="button"])')
  .isVisible()
  .catch(() => false);

await page.goto(`${base}/shuffle?qaDebug=1`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.evaluate(() => {
  sessionStorage.removeItem("sayittome:shuffle:legal-unlocked:v1");
  sessionStorage.removeItem("sayittome_anon_legal_accepted_v1");
  localStorage.setItem("sayittome_locale_prompt_done", "1");
  localStorage.setItem(
    "sayittome-chat-notification-prefs",
    JSON.stringify({ enabled: false, prompted: true }),
  );
});
await page.reload({ waitUntil: "domcontentloaded" });
const legalToggle = page.locator("[data-legal-accept-toggle='1']");
if (await legalToggle.count()) {
  await legalToggle.click({ force: true });
  await page.locator("[data-legal-accept-submit='1']").click({ force: true });
}

await page.waitForFunction(
  () => document.querySelectorAll("[data-shuffle-list] > *").length > 0,
  null,
  { timeout: 30_000 },
).catch(() => null);
const cardsRendered = await page
  .locator("[data-shuffle-list] > *")
  .count();
const qaDebugShuffleVisible =
  (await page.locator("[data-qa-debug-overlay='1']").count()) === 1;
await page.locator("[data-qa-debug-copy='1']").click({ force: true });
await page.waitForTimeout(100);
const clipboardText = await page.evaluate(() =>
  navigator.clipboard.readText().catch(() => ""),
);
let copiedDiagnostics = null;
try {
  copiedDiagnostics = JSON.parse(clipboardText);
} catch {
  copiedDiagnostics = null;
}

await browser.close();

const apiProfiles = Array.isArray(shuffleJson?.profiles)
  ? shuffleJson.profiles.length
  : 0;
const report = {
  gate: "PREVIEW_AUTH_ANON_SHUFFLE_VIABILITY",
  pass:
    rootProbe.status === 200 &&
    loginProbe.status === 200 &&
    loginProbe.text !== rootProbe.text &&
    shuffleApiProbe.status === 200 &&
    shuffleApiProbe.contentType.includes("application/json") &&
    apiProfiles > 0 &&
    loginLinkVisible &&
    loginFormVisible &&
    loginButtonVisible &&
    cardsRendered > 0 &&
    qaDebugRootVisible &&
    qaDebugShuffleVisible &&
    Boolean(copiedDiagnostics?.auth) &&
    Boolean(copiedDiagnostics?.shuffle),
  base,
  login: {
    rootStatus: rootProbe.status,
    loginStatus: loginProbe.status,
    loginContentType: loginProbe.contentType,
    loginIsDistinctRoute: loginProbe.text !== rootProbe.text,
    loginLinkVisible,
    loginFormVisible,
    loginButtonVisible,
  },
  anonymousShuffle: {
    apiStatus: shuffleApiProbe.status,
    apiContentType: shuffleApiProbe.contentType,
    apiProfiles,
    cardsRendered,
    bodySample: shuffleApiProbe.text.slice(0, 180),
  },
  qaDebug: {
    rootVisible: qaDebugRootVisible,
    shuffleVisible: qaDebugShuffleVisible,
    copied: Boolean(copiedDiagnostics),
    hasAuth: Boolean(copiedDiagnostics?.auth),
    hasShuffle: Boolean(copiedDiagnostics?.shuffle),
  },
  consoleErrors,
};

if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
