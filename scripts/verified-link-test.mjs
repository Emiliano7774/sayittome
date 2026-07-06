import assert from "node:assert/strict";

function normalizeUsername(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, "");
}

function normalizeVerifiedProfileUsername(username) {
  let clean = normalizeUsername(username);
  if (clean.startsWith("@")) clean = clean.slice(1);
  return clean;
}

function displayVerifiedProfileLink(username) {
  const slug = normalizeVerifiedProfileUsername(username).toLowerCase();
  return `sytm.me/@${slug}`;
}

function getVerifiedProfileUrl(username) {
  return `https://${displayVerifiedProfileLink(username)}`;
}

assert.equal(normalizeVerifiedProfileUsername("Emiliano"), "Emiliano");
assert.equal(normalizeVerifiedProfileUsername("@emiliano"), "emiliano");
assert.equal(displayVerifiedProfileLink("Emiliano"), "sytm.me/@emiliano");
assert.equal(displayVerifiedProfileLink("@Emiliano"), "sytm.me/@emiliano");
assert.equal(getVerifiedProfileUrl("navbench"), "https://sytm.me/@navbench");
assert.equal(getVerifiedProfileUrl("@navbench"), "https://sytm.me/@navbench");

console.log("verified-link-test: ok");
