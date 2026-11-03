import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/app/settings/page.tsx", "utf8");
assert.match(source, /const stillActive = getCurrentMainTabPathname\(\) === "\/settings";/);
assert.match(source, /settingsRouteActive: getCurrentMainTabPathname\(\) === "\/settings",/);
assert.match(source, /\}, \[loadProfile, router, settingsRouteActive\]\);/);
assert.doesNotMatch(source, /\}, \[loadProfile, pathname, router, settingsRouteActive\]\);/);
assert.match(source, /window\.addEventListener\("focus", refreshProfileOnFocus\)/);
assert.match(source, /document\.addEventListener\("visibilitychange", refreshProfileOnFocus\)/);
assert.match(source, /unsub\(\)/);
console.log("PASS_SETTINGS_AUTH_LISTENER_STABLE_NON_SETTINGS_TABS");
