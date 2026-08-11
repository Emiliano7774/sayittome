/**
 * Confirm the served hosting release. Do not assume deploy success.
 * Usage: node scripts/verify-hosting-release.mjs [expectedSha]
 */
const expected = String(process.argv[2] || "").trim();
const origin = process.env.HOSTING_ORIGIN || "https://sayittome-app.web.app";

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, url, json };
}

const [release, version, sha] = await Promise.all([
  getJson(`${origin}/build-release.json`),
  getJson(`${origin}/app-version.json`),
  getJson(`${origin}/api/build-sha`),
]);

const servedSha = String(
  release.json?.sha || sha.json?.sha || "",
).trim();
const match = expected ? servedSha.startsWith(expected.slice(0, 7)) : Boolean(servedSha);

const report = {
  gate: "HOSTING_RELEASE",
  pass: Boolean(release.ok && match),
  origin,
  expected: expected || null,
  servedSha: servedSha || null,
  release,
  version,
  sha,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
