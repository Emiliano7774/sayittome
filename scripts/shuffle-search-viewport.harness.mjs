/**
 * Shuffle search list must clear toolbar + browser chrome + keyboard.
 *   node scripts/shuffle-search-viewport.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewport = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleSearchViewport.ts")).href
);

const rest = viewport.shuffleListExtraPx({ searchOpen: false, browserChromeBottom: 0 });
assert.ok(rest >= 150, "resting list must clear overlay browser bar + last row");

const searchingNoChrome = viewport.shuffleListExtraPx({
  searchOpen: true,
  browserChromeBottom: 0,
});
assert.ok(
  searchingNoChrome >= rest + 250,
  "search + keyboard must add enough clearance when visualViewport does not shrink",
);

const searchingWithKeyboard = viewport.shuffleListExtraPx({
  searchOpen: true,
  browserChromeBottom: 320,
});
assert.ok(
  searchingWithKeyboard >= rest,
  "when chrome already includes the keyboard, keep overlay + last-row room",
);

const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
assert.match(css, /grid-column:\s*1\s*\/\s*-1/);
assert.match(css, /--sayittome-shuffle-list-extra/);
assert.match(css, /scroll-padding-bottom/);

const feed = fs.readFileSync(
  path.join(root, "src/components/shuffle/ShuffleFeedWithNativeAds.tsx"),
  "utf8",
);
assert.match(feed, /sayittome-nav-scroll-spacer/);

console.log("PASS shuffle-search-viewport");
