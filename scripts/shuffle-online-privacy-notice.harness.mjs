/**
 * Live Classic + Modern: solo-online empty must show privacy note.
 * Uses separate contexts for soloOnline on/off (avoids keep-alive/filter click flakiness).
 *
 * Usage: node scripts/shuffle-online-privacy-notice.harness.mjs --base http://127.0.0.1:3031
 */
import { chromium, devices } from "playwright";

const baseArg = process.argv.indexOf("--base");
const base =
  (baseArg >= 0 && process.argv[baseArg + 1]) || "http://127.0.0.1:3031";

const FILTERS_KEY = "sayittome_shuffle_filters_v1";

function filtersPayload(soloOnline) {
  return JSON.stringify({
    edadMin: 0,
    edadMax: 0,
    pais: "",
    sexo: "todos",
    provincia: "",
    ciudad: "",
    soloOnline: Boolean(soloOnline),
    soloConFoto: false,
    soloConHistorias: false,
    intereses: [],
  });
}

async function acceptLegal(page) {
  const legalToggle = page.locator("[data-legal-accept-toggle='1']");
  if (await legalToggle.count()) {
    await legalToggle.click({ force: true });
    const accept = page.locator("button").filter({ hasText: /Acepto|Accept/i }).first();
    if (await accept.count()) await accept.click({ force: true });
    await page.waitForTimeout(700);
  }
}

async function settle(page) {
  await page.waitForTimeout(2800);
}

async function snap(page) {
  return page.evaluate(() => {
    const note = document.querySelector('[data-shuffle-online-privacy-note="1"]');
    const err = document.querySelector('[data-shuffle-error-shell="1"]');
    const slots = document.querySelectorAll(
      "[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)",
    ).length;
    const hosts = document.querySelectorAll("#sayittome-shuffle-keepalive-host").length;
    const loading = Boolean(document.querySelector("[data-loading-shell]"));
    const notes = document.querySelectorAll('[data-shuffle-online-privacy-note="1"]').length;
    return {
      noteVisible: Boolean(note) && (note?.getBoundingClientRect().height || 0) > 8,
      noteCount: notes,
      noteText: note?.textContent?.slice(0, 180) || null,
      hasErrorShell: Boolean(err),
      bodyHasRecuperacion: /Recuperaci[oó]n/i.test(document.body.innerText),
      slots,
      hosts,
      loading,
      mode: localStorage.getItem("sayittome_ux_mode"),
      hasFiltersEmptyTitle: /Ningún perfil coincide|No profiles match/i.test(
        document.body.innerText,
      ),
    };
  });
}

async function runCase(browser, mode, soloOnline) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    serviceWorkers: "block",
  });
  await context.addInitScript(
    ({ ux, filtersKey, payload }) => {
      localStorage.setItem("sayittome_ux_mode", ux);
      localStorage.setItem("sayittome_locale_prompt_done", "1");
      localStorage.setItem(
        "sayittome-chat-notification-prefs",
        JSON.stringify({ enabled: false, prompted: true }),
      );
      localStorage.setItem(filtersKey, payload);
    },
    {
      ux: mode,
      filtersKey: FILTERS_KEY,
      payload: filtersPayload(soloOnline),
    },
  );

  const page = await context.newPage();
  const localErrors = [];
  const shuffleGets = [];
  page.on("pageerror", (e) => localErrors.push(String(e)));
  page.on("request", (r) => {
    if (r.url().includes("/api/shuffle") && r.method() === "GET") {
      shuffleGets.push(r.url());
    }
  });

  await page.goto(`${base}/shuffle?qaDebug=1`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await acceptLegal(page);
  await settle(page);
  const shot = await snap(page);
  await context.close();
  return { shot, localErrors, shuffleGets: shuffleGets.length };
}

const browser = await chromium.launch({ headless: true });
const cases = [];

for (const mode of ["classic", "modern"]) {
  const on = await runCase(browser, mode, true);
  const off = await runCase(browser, mode, false);
  const has310 = [...on.localErrors, ...off.localErrors].some((e) =>
    /#310|Rendered more hooks/i.test(e),
  );
  cases.push({
    mode,
    soloOnlineOn: on.shot,
    soloOnlineOff: off.shot,
    shuffleGetsOn: on.shuffleGets,
    shuffleGetsOff: off.shuffleGets,
    pageErrors: [...on.localErrors, ...off.localErrors],
    pass:
      on.shot.noteVisible &&
      on.shot.noteCount === 1 &&
      on.shot.hasFiltersEmptyTitle &&
      !on.shot.loading &&
      !on.shot.hasErrorShell &&
      !on.shot.bodyHasRecuperacion &&
      on.shot.slots === 0 &&
      on.shot.hosts <= 1 &&
      !off.shot.noteVisible &&
      off.shot.slots > 0 &&
      !has310,
  });
}

const report = {
  gate: "SHUFFLE_ONLINE_PRIVACY_NOTICE_LIVE",
  base,
  cases,
  anyReact310: cases.some((c) =>
    c.pageErrors.some((e) => /#310|Rendered more hooks/i.test(e)),
  ),
  pass: cases.every((c) => c.pass),
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.pass) process.exitCode = 1;
