/**
 * Shuffle entry legal accept must sit above the phone nav / browser chrome.
 *   node scripts/entry-legal-viewport.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const modal = fs.readFileSync(
  path.join(root, "src/components/legal/AnonymousEntryLegalModal.tsx"),
  "utf8",
);

assert.match(css, /--sayittome-vvh/);
assert.match(css, /\.sayittome-entry-legal-modal/);
assert.match(css, /max\(var\(--sayittome-browser-chrome-bottom, 0px\), 64px\)/);
assert.doesNotMatch(modal, /min-h-\[100dvh\]/);
assert.match(modal, /sayittome-entry-legal-modal/);

const inset = fs.readFileSync(
  path.join(root, "src/components/layout/VisualViewportInset.tsx"),
  "utf8",
);
assert.match(inset, /--sayittome-vvh/);

console.log("PASS entry-legal-viewport");
