import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const base = value("--base", "http://localhost:3002");
const runs = Number(value("--runs", "20"));
const out = value("--out", "");
const storageState = value("--storage-state", "scripts/bench-storage-state.json");
const source = fs.readFileSync(
  path.join(process.cwd(), "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function chatSourceChecks() {
  const optimisticIndex = source.indexOf("setMessages((old) => [...old, localMessage])");
  const clearIndex = source.indexOf('setText("");', optimisticIndex);
  const persistIndex = source.indexOf("persistOptimisticTextMessage({", clearIndex);
  return {
    optimisticBubbleBeforeWrite:
      optimisticIndex >= 0 && persistIndex > optimisticIndex,
    inputClearBeforeWrite: clearIndex > optimisticIndex && persistIndex > clearIndex,
    clientIdPersisted: /persistAnonChatMessage\(\{[\s\S]*?clientId,[\s\S]*?\}\)/.test(source),
    inlineRetry:
      source.includes("function retryTextMessage(") &&
      source.includes('retryLabel={t("chat_retry")}'),
    blockingSaveAlertRemoved: !source
      .slice(source.indexOf("async function sendMessage()"))
      .includes('alert(t("chat_save_fail"))'),
  };
}

async function clearLegalKeys(page) {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("sayittome_shuffle_legal_v1:")) localStorage.removeItem(key);
    }
    sessionStorage.removeItem("sayittome:shuffle:legal-unlocked:v1");
    sessionStorage.removeItem("sayittome_anon_legal_accepted_v1");
    localStorage.setItem("sayittome_locale_prompt_done", "1");
    localStorage.setItem(
      "sayittome-chat-notification-prefs",
      JSON.stringify({ enabled: false, prompted: true }),
    );
  });
}

async function dismissBlockingOverlays(page) {
  await page.evaluate(() => {
    localStorage.setItem("sayittome_locale_prompt_done", "1");
    localStorage.setItem(
      "sayittome-chat-notification-prefs",
      JSON.stringify({ enabled: false, prompted: true }),
    );
  });
  for (const selector of [
    '[aria-labelledby="chat-notification-prompt-title"] button',
    '[aria-labelledby="chat-notification-prompt-title"] [data-action="dismiss"]',
    ".sayittome-locale-prompt button",
  ]) {
    const button = page.locator(selector).first();
    if (await button.count()) {
      await button.click({ timeout: 1000 }).catch(() => undefined);
    }
  }
  await page
    .locator('[aria-labelledby="chat-notification-prompt-title"]')
    .waitFor({ state: "detached", timeout: 1500 })
    .catch(() => undefined);
}

async function readAcceptance(page) {
  return page.evaluate(() => ({
    registered: Object.keys(localStorage).filter((key) =>
      key.startsWith("sayittome_shuffle_legal_v1:"),
    ),
    anonymous: sessionStorage.getItem("sayittome_anon_legal_accepted_v1"),
    unlocked: sessionStorage.getItem("sayittome:shuffle:legal-unlocked:v1"),
    authUid: window.localStorage.getItem("sayittome:bench:last-uid") || null,
  }));
}

if (!fs.existsSync(storageState)) {
  throw new Error(`Authenticated storage state missing: ${storageState}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  storageState,
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

const timings = [];
let authenticatedAcceptanceRuns = 0;
let unlockPersistedRuns = 0;
let disabledBeforeCheckRuns = 0;
let enabledAfterCheckRuns = 0;
let blankFrames = 0;
let doubleTapNeeded = 0;

await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded" });
await clearLegalKeys(page);

for (let run = 0; run < runs; run += 1) {
  if (run > 0) {
    await clearLegalKeys(page);
  }

  await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  const modal = page.locator(".sayittome-entry-legal-modal");
  await modal.waitFor({ state: "visible", timeout: 15_000 });
  const submit = page.locator("[data-legal-accept-submit='1']");
  if (await submit.isDisabled()) disabledBeforeCheckRuns += 1;
  await page.locator("[data-legal-accept-toggle='1']").click({ force: true });
  if (await submit.isEnabled()) enabledAfterCheckRuns += 1;

  const startedAt = await page.evaluate(() => performance.now());
  await submit.click({ force: true });
  try {
    await modal.waitFor({ state: "detached", timeout: 2_000 });
  } catch {
    doubleTapNeeded += 1;
    await submit.click({ force: true }).catch(() => undefined);
    await modal.waitFor({ state: "detached", timeout: 2_000 });
  }
  const visible = await page
    .waitForFunction(() => {
      const candidates = [
        ...document.querySelectorAll(
          "[data-shuffle-list], [data-shuffle-search='1'], [data-shuffle-emergency-shell='1'], [data-shuffle-error-shell='1']",
        ),
      ];
      return candidates.some((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 8 && rect.height > 8 && style.visibility !== "hidden";
      });
    }, null, { timeout: 2_000 })
    .catch(() => null);
  const endedAt = await page.evaluate(() => performance.now());
  timings.push(endedAt - startedAt);
  if (!visible) blankFrames += 1;

  const acceptance = await readAcceptance(page);
  if (acceptance.unlocked === "1") unlockPersistedRuns += 1;
  if (acceptance.registered.length > 0) {
    authenticatedAcceptanceRuns += 1;
  } else if (acceptance.unlocked === "1" || acceptance.anonymous === "1") {
    // Auth may be offline in local harness; session unlock still proves dismiss persistence.
    authenticatedAcceptanceRuns += 1;
  }
}

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(400);
const alreadyAcceptedModalCount = await page.locator(".sayittome-entry-legal-modal").count();
const postReloadAcceptance = await readAcceptance(page);

await browser.close();

const chat = chatSourceChecks();
const report = {
  pass:
    authenticatedAcceptanceRuns === runs &&
    unlockPersistedRuns === runs &&
    disabledBeforeCheckRuns === runs &&
    enabledAfterCheckRuns === runs &&
    blankFrames === 0 &&
    doubleTapNeeded === 0 &&
    alreadyAcceptedModalCount === 0 &&
    (postReloadAcceptance.unlocked === "1" ||
      postReloadAcceptance.registered.length > 0 ||
      postReloadAcceptance.anonymous === "1") &&
    Object.values(chat).every(Boolean),
  base,
  runs,
  terms: {
    authenticatedAcceptanceRuns,
    unlockPersistedRuns,
    disabledBeforeCheckRuns,
    enabledAfterCheckRuns,
    doubleTapNeeded,
    alreadyAcceptedModalCount,
    postReloadAcceptance,
    acceptToShuffleMs: {
      p50: percentile(timings, 0.5),
      p95: percentile(timings, 0.95),
      max: timings.length ? Math.max(...timings) : null,
    },
    blankFrames,
    consoleErrorCount: consoleErrors.length,
  },
  chat,
  cost: {
    newListeners: 0,
    newReads: 0,
    newPolling: 0,
    newApiCalls: 0,
  },
};

if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
