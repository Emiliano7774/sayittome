import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://sayittome-app.web.app";

const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : path.join("scripts", "ghost-filmstrip-out", `profile-chat-${Date.now()}`);

const storagePath = "scripts/bench-storage-state.json";

async function sample(page) {
  return page.evaluate(() => ({
    pathname: location.pathname,
    profileMain: Boolean(document.querySelector("[data-nav-profile-main]")),
    profilePrimary: Boolean(document.querySelector("[data-nav-primary-content][data-nav-profile-main]")),
    chatPrimary: Boolean(document.querySelector("[data-nav-chat-primary], [data-chat-primary]")),
    shuffleVisible: document
      .getElementById("sayittome-shuffle-keepalive-host")
      ?.classList.contains("sayittome-shuffle-keepalive-visible"),
    loading: /Cargando\.\.\.|Loading\.\.\./i.test(document.body.textContent?.slice(0, 500) ?? ""),
  }));
}

async function captureTransition(page, cdp, name, setup, action) {
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await setup();
  await page.waitForTimeout(1200);

  const frames = [];
  let seq = 0;
  cdp.on("Page.screencastFrame", async (params) => {
    if (seq >= 30) return;
    const idx = seq++;
    frames[idx] = {
      index: idx,
      buffer: Buffer.from(params.data, "base64"),
      geometry: await sample(page).catch(() => null),
    };
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
    } catch {
      /* ended */
    }
  });

  await cdp.send("Page.startScreencast", {
    format: "png",
    quality: 85,
    maxWidth: 780,
    maxHeight: 1688,
    everyNthFrame: 1,
  });
  await action();
  await page.waitForTimeout(1200);
  try {
    await cdp.send("Page.stopScreencast");
  } catch {
    /* ignore */
  }
  cdp.removeAllListeners("Page.screencastFrame");

  for (const frame of frames.filter(Boolean)) {
    fs.writeFileSync(path.join(dir, `frame-${String(frame.index).padStart(2, "0")}.png`), frame.buffer);
  }

  const report = { transition: name, frames: frames.filter(Boolean).map((f) => ({ index: f.index, geometry: f.geometry })) };
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

async function dismissEntryModals(page) {
  for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i, /Ahora no/i, /Not now/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(400);
    }
  }
}

async function waitForShuffleProfiles(page) {
  await page.waitForFunction(
    () => {
      const host = document.getElementById("sayittome-shuffle-keepalive-host");
      const list = host?.querySelector("[data-shuffle-list]");
      return (
        list?.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)").length ?? 0
      ) > 0;
    },
    undefined,
    { timeout: 60000 },
  ).catch(() => {});
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    storageState: fs.existsSync(storagePath) ? storagePath : undefined,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  try {
    await captureTransition(
      page,
      cdp,
      "shuffle-profile",
      async () => {
        await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await dismissEntryModals(page);
        await waitForShuffleProfiles(page);
        await page.waitForSelector(
          'button[data-action="profile"][data-username], .sayittome-shuffle-keepalive-visible button[data-action="profile"][data-username]',
          { timeout: 60000 },
        );
      },
      async () => {
        const btn = page.locator('button[data-action="profile"][data-username]').first();
        await btn.dispatchEvent("pointerdown");
        await btn.click();
        await page.waitForURL(/\/u\//, { timeout: 20000 });
      },
    );

    await captureTransition(
      page,
      cdp,
      "profile-chat",
      async () => {},
      async () => {
        const chat = page.locator("[data-nav-profile-chat]").first();
        await chat.click({ timeout: 15000 });
        await page.waitForURL(/\/chat\//, { timeout: 20000 });
      },
    );

    await captureTransition(
      page,
      cdp,
      "chat-profile",
      async () => {},
      async () => {
        const back = page.locator('[data-nav-back-profile], [data-profile-back]').first();
        if (await back.count()) {
          await back.click();
        } else {
          await page.goBack();
        }
        await page.waitForURL(/\/u\//, { timeout: 20000 });
      },
    );

    await captureTransition(
      page,
      cdp,
      "profile-shuffle",
      async () => {},
      async () => {
        await page.locator('[data-nav-tab="shuffle"]').first().click();
        await page.waitForURL(/\/shuffle/, { timeout: 20000 });
      },
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
