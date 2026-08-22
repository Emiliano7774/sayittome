/**
 * ANDROID_COLD_LAUNCH_NOTICE
 * Home notice with X shows once per native process / cold launch.
 * Not forever (localStorage) and not on every route change.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const dismissSrc = fs.readFileSync(
  path.join(root, "src/lib/promo/webHomeBannerDismiss.ts"),
  "utf8",
);
assert.match(dismissSrc, /WEB_HOME_BANNER_SESSION_KEY/);
assert.match(dismissSrc, /dismissedThisLaunch/);
assert.doesNotMatch(dismissSrc, /localStorage\.setItem/);
assert.match(dismissSrc, /sessionStorage\.setItem/);

const bannerSrc = fs.readFileSync(
  path.join(root, "src/components/promo/WebVersionPromoBanner.tsx"),
  "utf8",
);
assert.match(bannerSrc, /isWebHomeBannerDismissed/);
assert.match(bannerSrc, /dismissWebHomeBanner/);
assert.doesNotMatch(bannerSrc, /usePathname/);

const dismiss = await import(
  pathToFileURL(path.join(root, "src/lib/promo/webHomeBannerDismiss.ts")).href
);

dismiss.resetHomeNoticeDismissForTests();
globalThis.window.localStorage.setItem(dismiss.WEB_HOME_BANNER_DISMISSED_KEY, "1");
assert.equal(
  dismiss.isWebHomeBannerDismissed(),
  false,
  "legacy permanent localStorage must not hide the notice",
);

dismiss.dismissWebHomeBanner();
assert.equal(dismiss.isWebHomeBannerDismissed(), true);
assert.equal(dismiss.isHomeNoticeDismissedThisLaunch(), true);
assert.equal(
  globalThis.window.sessionStorage.getItem(dismiss.WEB_HOME_BANNER_SESSION_KEY),
  "1",
);

const afterRoute = dismiss.isWebHomeBannerDismissed();
assert.equal(afterRoute, true, "route changes keep the same-launch dismiss");

dismiss.resetHomeNoticeDismissForTests();
assert.equal(
  dismiss.isWebHomeBannerDismissed(),
  false,
  "new cold launch / native process shows the notice again",
);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_COLD_LAUNCH_NOTICE",
      pass: true,
      note: "Product dismiss imported. Physical native reopen still PENDING.",
    },
    null,
    2,
  ),
);
