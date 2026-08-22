/**
 * Real Chromium DOM remount + CLS for ShuffleFeedWithNativeAds.
 * Usage: node --experimental-strip-types scripts/shuffle-feed-remount-dom.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feedSource = fs.readFileSync(
  path.join(root, "src/components/shuffle/ShuffleFeedWithNativeAds.tsx"),
  "utf8",
);
const listKeyedByWindowGeneration = /key=\{windowGeneration\}/.test(feedSource);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shuffle-remount-"));
const bundlePath = path.join(tmpDir, "shuffle-feed-remount.js");

try {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [path.join(root, "scripts/shuffle-feed-remount.fixture.tsx")],
    outfile: bundlePath,
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    alias: { "@": path.join(root, "src") },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_ADS_ENABLED": '"false"',
    },
    logLevel: "silent",
  });
} catch (error) {
  console.log(
    JSON.stringify(
      {
        gate: "SHUFFLE_FEED_REMOUNT_DOM",
        pass: "PENDING",
        reason: "esbuild-tooling",
        error: String(error?.message || error),
      },
      null,
      2,
    ),
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; background: #0b0b0b; color: #fff; }
      #root { min-height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="/bundle.js"></script>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(fs.readFileSync(bundlePath));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__shuffleRemount));

  const profiles = [
    { uid: "fb-a", authUid: "fb-a", username: "ada", photo: "", bio: "a", showOnline: false, blurPhoto: false },
    { uid: "fb-b", authUid: "fb-b", username: "bea", photo: "", bio: "b", showOnline: false, blurPhoto: false },
    { uid: "fb-c", authUid: "fb-c", username: "cal", photo: "", bio: "c", showOnline: false, blurPhoto: false },
  ];
  const renamed = profiles.map((profile, index) =>
    index === 0 ? { ...profile, username: "ada_renamed" } : profile,
  );

  await page.evaluate((next) => window.__shuffleRemount.paint(next, false), profiles);
  await page.waitForSelector("[data-shuffle-list] [data-shuffle-row]");

  const baseline = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-shuffle-row]")];
    return {
      generation: window.__shuffleRemount.generation(),
      mountCounts: window.__shuffleRemount.mountCounts(),
      mountIds: rows.map((row) => row.getAttribute("data-mount-id")),
      identities: rows.map((row) => row.getAttribute("data-identity")),
    };
  });
  assert.equal(baseline.identities.length, 3);
  assert.equal(Object.values(baseline.mountCounts).every((count) => count === 1), true);

  await page.evaluate(() => {
    window.__shuffleCls = 0;
    window.__shuffleRowAdds = 0;
    window.__shuffleListReplaced = 0;
    const list = document.querySelector("[data-shuffle-list]");
    const host = document.getElementById("root");
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        window.__shuffleCls += entry.value || 0;
      }
    }).observe({ type: "layout-shift", buffered: false });
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === host && [...record.removedNodes].some((node) => node?.getAttribute?.("data-shuffle-list") === "")) {
          window.__shuffleListReplaced += 1;
        }
        for (const node of record.addedNodes) {
          if (node?.matches?.("[data-shuffle-row]")) window.__shuffleRowAdds += 1;
          window.__shuffleRowAdds += node?.querySelectorAll?.("[data-shuffle-row]")?.length || 0;
        }
      }
    }).observe(host, { childList: true, subtree: true });
    window.__shuffleListEl = list;
  });

  await page.evaluate((next) => window.__shuffleRemount.paint(next, true), profiles);
  await page.waitForTimeout(80);

  const afterReplace = await page.evaluate((beforeIds) => {
    const rows = [...document.querySelectorAll("[data-shuffle-row]")];
    const mountIds = rows.map((row) => row.getAttribute("data-mount-id"));
    const reused = mountIds.filter((id) => beforeIds.includes(id)).length;
    return {
      generation: window.__shuffleRemount.generation(),
      mountCounts: window.__shuffleRemount.mountCounts(),
      mountIds,
      identities: rows.map((row) => row.getAttribute("data-identity")),
      reused,
      remounted: mountIds.length - reused,
      rowAdds: window.__shuffleRowAdds,
      listReplaced: window.__shuffleListReplaced,
      cls: window.__shuffleCls,
      listIsSameNode: window.__shuffleListEl === document.querySelector("[data-shuffle-list]"),
    };
  }, baseline.mountIds);

  await page.evaluate((next) => window.__shuffleRemount.paint(next, false), renamed);
  await page.waitForTimeout(40);
  const afterRename = await page.evaluate(() => ({
    identities: [...document.querySelectorAll("[data-shuffle-row]")].map((row) =>
      row.getAttribute("data-identity"),
    ),
    mountCounts: window.__shuffleRemount.mountCounts(),
  }));

  assert.deepEqual(afterReplace.identities, baseline.identities);
  assert.equal(
    afterReplace.generation > baseline.generation,
    true,
    "forceReplace must still bump windowGeneration",
  );
  assert.equal(
    afterReplace.listIsSameNode,
    true,
    "key={windowGeneration} remounted the whole shuffle list DOM node",
  );
  assert.equal(
    afterReplace.remounted,
    0,
    `forceReplace with same identities remounted ${afterReplace.remounted} rows (CLS=${afterReplace.cls})`,
  );
  assert.equal(afterReplace.rowAdds, 0, `subtree added ${afterReplace.rowAdds} shuffle rows`);
  assert.ok(afterReplace.cls < 0.01, `unexpected CLS ${afterReplace.cls}`);
  assert.deepEqual(afterRename.identities, baseline.identities);
  assert.equal(
    Object.values(afterRename.mountCounts).every((count) => count === 1),
    true,
    "username rename remounted rows",
  );
  assert.equal(
    listKeyedByWindowGeneration,
    false,
    "ShuffleFeedWithNativeAds still keys the list by windowGeneration",
  );

  console.log(
    JSON.stringify(
      {
        gate: "SHUFFLE_FEED_REMOUNT_DOM",
        pass: true,
        listKeyedByWindowGeneration,
        generationBumped: afterReplace.generation - baseline.generation,
        remounted: afterReplace.remounted,
        rowAdds: afterReplace.rowAdds,
        listReplaced: afterReplace.listReplaced,
        cls: afterReplace.cls,
        listIsSameNode: afterReplace.listIsSameNode,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
