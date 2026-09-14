import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const { allowedAbuseOrigin } = await import(
  pathToFileURL(path.join(root, "src/lib/abuse/abuseCorsPolicy.ts")).href
);

function allowed(origin) {
  return allowedAbuseOrigin(origin);
}

assert.equal(allowed("https://sayittome-app.web.app"), "https://sayittome-app.web.app");
assert.equal(
  allowed("https://sayittome-app.firebaseapp.com"),
  "https://sayittome-app.firebaseapp.com",
);
assert.equal(allowed("https://evil.example"), "https://sayittome-app.web.app");
assert.equal(allowed("https://sayittome-app.web.app.evil.example"), "https://sayittome-app.web.app");
assert.equal(allowed(""), "https://sayittome-app.web.app");

console.log(JSON.stringify({ gate: "ABUSE_CORS_EXACT_ORIGIN", pass: true }));
