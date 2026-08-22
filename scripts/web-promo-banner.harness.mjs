#!/usr/bin/env node
/**
 * Static checks for the public Home native web notice.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

const bannerSrc = readFileSync(join(ROOT, "src/components/promo/WebVersionPromoBanner.tsx"), "utf8");
const dismissSrc = readFileSync(join(ROOT, "src/lib/promo/webHomeBannerDismiss.ts"), "utf8");
const hostedSrc = readFileSync(join(ROOT, "src/lib/app/hostedWeb.ts"), "utf8");
const classicHome = readFileSync(join(ROOT, "src/components/home/ClassicHome.tsx"), "utf8");
const modernHome = readFileSync(join(ROOT, "src/components/modern/ModernHome.tsx"), "utf8");
const classicShuffle = readFileSync(join(ROOT, "src/app/shuffle/shuffle-client.tsx"), "utf8");
const modernShuffle = readFileSync(join(ROOT, "src/app/shuffle/modern-shuffle-client.tsx"), "utf8");
const sessionRestore = readFileSync(join(ROOT, "src/components/home/HomeSessionRestore.tsx"), "utf8");
const nativeShell = readFileSync(join(ROOT, "src/lib/app/nativeShell.ts"), "utf8");
const messages = readFileSync(join(ROOT, "src/lib/i18n/messages.ts"), "utf8");

assert(bannerSrc.includes("isNativeAppShell()"), "banner must gate on native shell");
assert(bannerSrc.includes('useState(false)'), "banner must start hidden to avoid web flash");
assert(bannerSrc.includes("HOSTED_WEB_URL"), "banner must use hosted web URL");
assert(bannerSrc.includes("openHostedWeb"), "banner must open via helper");
assert(!bannerSrc.includes("sytm.me"), "banner must not use sytm.me");
assert(!bannerSrc.includes("fetch("), "banner must not fetch");
assert(!bannerSrc.includes("firestore"), "banner must not use firestore");

assert(hostedSrc.includes("https://sayittome-app.web.app"), "exact hosted URL");
assert(hostedSrc.includes('"_system"'), "prefer system browser");

assert(dismissSrc.includes("sayittome_web_home_banner_dismissed_session_v1"), "session dismiss key");
assert(dismissSrc.includes("dismissedThisLaunch"), "in-memory launch dismiss");
assert(!/localStorage\.setItem\(\s*WEB_HOME_BANNER_DISMISSED_KEY/.test(dismissSrc), "must not persist dismiss forever");
assert(dismissSrc.includes("sessionStorage"), "cold-launch session storage");

assert(classicHome.includes("WebVersionPromoBanner"), "classic public home mounts notice");
assert(classicHome.includes("<ApkDownloadSection"), "notice stays after apk section");
assert(classicHome.indexOf("WebVersionPromoBanner") > classicHome.indexOf("ApkDownloadSection"), "classic notice after apk section");
assert(classicHome.indexOf("WebVersionPromoBanner") < classicHome.indexOf("PublicLegalFooter"), "classic notice before legal footer");

assert(modernHome.includes("WebVersionPromoBanner"), "modern public home mounts notice");
assert(modernHome.indexOf("WebVersionPromoBanner") > modernHome.indexOf("ApkDownloadSection"), "modern notice after apk section");
assert(modernHome.indexOf("WebVersionPromoBanner") < modernHome.indexOf("PublicLegalFooter"), "modern notice before legal footer");

assert(!classicShuffle.includes("WebVersionPromoBanner"), "classic shuffle must not mount banner");
assert(!modernShuffle.includes("WebVersionPromoBanner"), "modern shuffle must not mount banner");

assert(sessionRestore.includes("authStateReady"), "session restore unchanged");
assert(sessionRestore.includes("resolvePostAuthPath"), "post-auth redirect unchanged");
assert(nativeShell.includes("isCapacitorNative"), "canonical native detector");

assert(messages.includes("También podés usar SayItToMe desde la web"), "es title copy");
assert(messages.includes("Accedé desde cualquier dispositivo, sin instalar nada."), "es body copy");
assert(!bannerSrc.includes("sytm.me"), "banner must not mention sytm.me");

console.log(
  JSON.stringify(
    {
      ok: fails.length === 0,
      fails,
      checks: [
        "native_only",
        "hosted_url",
        "public_home_bottom",
        "shuffle_untouched_by_banner",
        "session_restore_untouched",
        "session_dismiss_per_cold_launch",
      ],
    },
    null,
    2,
  ),
);

process.exit(fails.length ? 1 : 0);
