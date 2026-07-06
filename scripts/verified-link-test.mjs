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

function parseVerifiedProfileLinkInText(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const publicMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?sytm\.me\/@([a-zA-Z0-9._-]{3,24})\/?/i,
  );
  if (!publicMatch?.[1]) return null;

  const username = normalizeVerifiedProfileUsername(publicMatch[1]);
  return {
    username,
    profileHref: `/u/${encodeURIComponent(username)}?verified=1`,
    displayLink: displayVerifiedProfileLink(username),
  };
}

assert.equal(normalizeVerifiedProfileUsername("Emiliano"), "Emiliano");
assert.equal(normalizeVerifiedProfileUsername("@emiliano"), "emiliano");
assert.equal(displayVerifiedProfileLink("Emiliano"), "sytm.me/@emiliano");
assert.equal(displayVerifiedProfileLink("@Emiliano"), "sytm.me/@emiliano");
assert.equal(getVerifiedProfileUrl("navbench"), "https://sytm.me/@navbench");
assert.equal(getVerifiedProfileUrl("@navbench"), "https://sytm.me/@navbench");

const parsed = parseVerifiedProfileLinkInText("https://sytm.me/@sex");
assert.equal(parsed?.username, "sex");
assert.equal(parsed?.profileHref, "/u/sex?verified=1");
assert.equal(parsed?.displayLink, "sytm.me/@sex");

console.log("verified-link-test: ok");
