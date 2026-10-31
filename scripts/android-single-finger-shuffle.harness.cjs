const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ ...devices["Pixel 7"], viewport: { width: 393, height: 852 } });
    const url = process.env.SHUFFLE_E2E_URL || "http://127.0.0.1:3108/shuffle";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(5000);
    const initial = await page.evaluate(() => {
      document.body.classList.remove("sayittome-entry-legal-open");
      document.body.classList.add("sayittome-native-shell");
      document.documentElement.classList.add("sayittome-native-shell");
      for (const el of document.querySelectorAll('[role="dialog"], [data-entry-legal-overlay], .sayittome-entry-legal-overlay')) el.remove();
      const root = document.querySelector('#sayittome-shuffle-keepalive-host main[data-scroll-root]');
      if (!root) throw Error("No Shuffle scroll root");
      let list = root.querySelector("[data-shuffle-list]");
      if (!list) {
        list = document.createElement("div");
        list.setAttribute("data-shuffle-list", "1");
        root.appendChild(list);
      }
      if (root.scrollHeight < 2900) {
        const filler = document.createElement("div");
        filler.style.height = "3600px";
        filler.setAttribute("data-e2e-filler", "1");
        list.appendChild(filler);
      }
      const probe = document.createElement("button");
      probe.type = "button";
      probe.textContent = "gesture probe";
      probe.style.cssText = "display:block;width:100%;height:52px;";
      probe.setAttribute("data-touch-probe", "1");
      list.appendChild(probe);
      window.__touchTimes = {};
      probe.addEventListener("pointerdown", () => { window.__touchTimes.down = performance.now(); });
      probe.addEventListener("click", () => { window.__touchTimes.click = performance.now(); });
      return {
        htmlTouch: getComputedStyle(document.documentElement).touchAction,
        bodyTouch: getComputedStyle(document.body).touchAction,
        mainTouch: getComputedStyle(root).touchAction,
        listTouch: getComputedStyle(list).touchAction,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        realCards: document.querySelectorAll("[data-shuffle-card]").length,
      };
    });
    assert.equal(initial.htmlTouch, "auto", "HTML must not restrict native one-finger panning");
    assert.equal(initial.bodyTouch, "auto", "Body must not restrict native one-finger panning");
    assert.equal(initial.mainTouch, "auto", "Scrollable main must permit native gestures");
    assert.equal(initial.listTouch, "auto", "Card feed must permit native gestures");
    const cdp = await page.context().newCDPSession(page);
    const position = () => page.evaluate(() => document.querySelector("#sayittome-shuffle-keepalive-host main[data-scroll-root]").scrollTop);
    const send = (type, y) => cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x: 220, y, id: 1 }],
    });
    const moves = [];
    for (let n = 0; n < 4; n++) {
      const before = await position();
      await send("touchStart", 710);
      for (let k = 1; k <= 9; k++) {
        await send("touchMove", 710 - k * 46);
        await page.waitForTimeout(25);
      }
      await send("touchEnd", 296);
      await page.waitForTimeout(650);
      const after = await position();
      const delta = after - before;
      moves.push({ before, after, delta });
      assert.ok(delta > 150, "Single-finger swipe #" + n + " must scroll forward; delta=" + delta);
    }
    console.log(JSON.stringify({ result: "PASS_ANDROID_SINGLE_FINGER_SHUFFLE", url, ...initial, swipes: moves }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error("FAIL_ANDROID_SINGLE_FINGER_SHUFFLE", e.stack || e); process.exit(1); });
