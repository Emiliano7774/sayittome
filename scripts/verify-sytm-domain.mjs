/**
 * Verify public domain sytm.me for verified profile links.
 *
 * Usage:
 *   node scripts/verify-sytm-domain.mjs
 *   node scripts/verify-sytm-domain.mjs --username navbench
 */

import dns from "node:dns/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const username = args.includes("--username")
  ? args[args.indexOf("--username") + 1]
  : "navbench";

const host = "sytm.me";
const profileUrl = `https://${host}/@${username}`;

async function checkDns() {
  try {
    const records = await dns.resolve4(host);
    return { ok: true, records };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function checkHttpsRedirect() {
  const res = await fetch(profileUrl, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  return {
    status: res.status,
    location,
    https: res.url.startsWith("https://") || profileUrl.startsWith("https://"),
  };
}

async function checkBrowserProfile() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    const pathname = new URL(finalUrl).pathname;
    const hasVerified = new URL(finalUrl).searchParams.get("verified") === "1";
    const title = await page.title().catch(() => "");
    const hasProfileShell = await page
      .locator("[data-nav-profile-main], main")
      .first()
      .isVisible()
      .catch(() => false);

    return {
      finalUrl,
      pathname,
      hasVerified,
      title,
      hasProfileShell,
      ok:
        finalUrl.includes(host) &&
        pathname.toLowerCase() === `/u/${username.toLowerCase()}` &&
        hasProfileShell,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const dnsResult = await checkDns();
  const redirectResult = dnsResult.ok ? await checkHttpsRedirect().catch((e) => ({ error: String(e) })) : null;
  const browserResult = dnsResult.ok ? await checkBrowserProfile().catch((e) => ({ error: String(e) })) : null;

  const report = {
    host,
    profileUrl,
    dns: dnsResult,
    redirect: redirectResult,
    browser: browserResult,
    passed: Boolean(dnsResult.ok && browserResult?.ok),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
