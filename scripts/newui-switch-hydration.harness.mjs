/**
 * Classic ↔ New UI switch with hard fail on React #418 hydration mismatch.
 * Usage: node scripts/newui-switch-hydration.harness.mjs --base http://localhost:3022
 */
import { chromium, devices } from "playwright";

const baseArg = process.argv.indexOf("--base");
const base =
  (baseArg >= 0 && process.argv[baseArg + 1]) || "http://127.0.0.1:3022";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["Pixel 7"],
  serviceWorkers: "block",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(`${base}/shuffle?qaDebug=1`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.evaluate(() => {
  localStorage.setItem("sayittome_locale_prompt_done", "1");
  localStorage.setItem(
    "sayittome-chat-notification-prefs",
    JSON.stringify({ enabled: false, prompted: true }),
  );
  localStorage.setItem("sayittome_ux_mode", "classic");
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2000);

const legalToggle = page.locator("[data-legal-accept-toggle='1']");
if (await legalToggle.count()) {
  await legalToggle.click({ force: true });
  const accept = page.locator("button").filter({ hasText: /Acepto|Accept/i }).first();
  if (await accept.count()) await accept.click({ force: true });
  await page.waitForTimeout(1000);
}

const switched = await page.evaluate(() => {
  const modern = [...document.querySelectorAll("button")].find((button) =>
    /Nuevo|New|Nuovo|Neu|moderna|modern/i.test(
      button.getAttribute("aria-label") || button.textContent || "",
    ),
  );
  if (!modern) return false;
  modern.click();
  return true;
});
if (!switched) {
  await page.evaluate(() => {
    localStorage.setItem("sayittome_ux_mode", "modern");
    window.location.reload();
  });
  await page.waitForLoadState("domcontentloaded");
}

await page.waitForTimeout(3000);
const after = await page.evaluate(() => ({
  mode: localStorage.getItem("sayittome_ux_mode"),
  dataUx: document.documentElement.getAttribute("data-ux"),
  text: document.body.innerText.slice(0, 500),
  hasErrorShell: Boolean(
    document.querySelector('[data-shuffle-error-shell="1"]'),
  ),
  bodyHasRecuperacion: /Recuperaci[oó]n/i.test(document.body.innerText),
  bodyHasProblema: /tuvo un problema/i.test(document.body.innerText),
  crashLike: /something went wrong|application error|uncaught|cannot read|is not defined/i.test(
    document.body.innerText,
  ),
}));

const hydrationErrors = errors.filter((error) =>
  /Minified React error #418|Hydration failed|didn'?t match the client/i.test(error),
);
const networkNoise = errors.filter((error) =>
  /Failed to fetch|Firestore|unavailable|network/i.test(error),
);

const report = {
  gate: "NEW_UI_SWITCH_HYDRATION",
  base,
  after,
  hydrationErrors,
  networkNoiseCount: networkNoise.length,
  pass:
    after.mode === "modern" &&
    !after.crashLike &&
    !after.hasErrorShell &&
    !after.bodyHasRecuperacion &&
    !after.bodyHasProblema &&
    /Visibles|Perfiles|Shuffle/i.test(after.text) &&
    hydrationErrors.length === 0,
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.pass) process.exitCode = 1;
