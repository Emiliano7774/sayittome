import assert from "node:assert/strict";
const { SHUFFLE_REGISTERED_ONLINE_WINDOW_MS, ONLINE_WINDOW_MS, isShuffleProfileOnline } =
  await import("../src/lib/presence.ts");
const { ANON_SHUFFLE_VISIBILITY_MS, anonShuffleVisible } =
  await import("../src/lib/anonMatch/anonymousPresenceIdentity.ts");
const now = Date.UTC(2026, 10, 8, 6, 30);
const heartbeat = (ageMs) => new Date(now - ageMs).toISOString();
const profile = (ageMs) =>
  isShuffleProfileOnline({ presenceAt: heartbeat(ageMs) }, now, SHUFFLE_REGISTERED_ONLINE_WINDOW_MS);
assert.equal(SHUFFLE_REGISTERED_ONLINE_WINDOW_MS, 360_000_000);
assert.equal(ONLINE_WINDOW_MS, 10_800_000, "Unrelated features retain the existing three-hour window");
assert.equal(ANON_SHUFFLE_VISIBILITY_MS, 10_800_000);
assert.equal(profile(0), true);
assert.equal(profile(3 * 60 * 60_000), true);
assert.equal(profile(99 * 60 * 60_000), true);
assert.equal(profile(SHUFFLE_REGISTERED_ONLINE_WINDOW_MS), true);
assert.equal(profile(SHUFFLE_REGISTERED_ONLINE_WINDOW_MS + 1), false);
assert.equal(anonShuffleVisible(now - ANON_SHUFFLE_VISIBILITY_MS, now), true);
assert.equal(anonShuffleVisible(now - ANON_SHUFFLE_VISIBILITY_MS - 1, now), false);
assert.equal(isShuffleProfileOnline({ onlineUntilAt: new Date(now + 90_000).toISOString() }, now, SHUFFLE_REGISTERED_ONLINE_WINDOW_MS), true);
assert.equal(isShuffleProfileOnline({ onlineUntilAt: new Date(now - 1).toISOString() }, now, SHUFFLE_REGISTERED_ONLINE_WINDOW_MS), false);
console.log("PASS: registered profiles 100h; anonymous 3h; other registered features 3h; inclusive boundaries");
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
for (const rel of [
  "src/lib/presence.ts", "src/lib/profile/lastSeenVisibility.ts",
  "src/lib/shuffle/serverFilters.ts", "src/lib/shuffle/normalize.ts",
  "src/lib/shuffle/refreshPresence.ts", "src/hooks/useShufflePool.ts",
  "src/app/api/shuffle/route.ts",
]) {
  const text = readFileSync(new URL("../" + rel, import.meta.url), "utf8");
  const result = ts.transpileModule(text, { fileName: rel, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve } });
  assert.equal(result.diagnostics?.length || 0, 0, rel + " must parse");
}
console.log("PASS: all seven modified TypeScript files transpile syntactically");
const { isPublicShuffleOnline } = await import("../src/lib/profile/lastSeenVisibility.ts");
const registrationAt = heartbeat(99 * 60 * 60_000);
assert.equal(isPublicShuffleOnline({ mostrarUltimaVez: true, presenceAt: registrationAt },
  (p) => isShuffleProfileOnline(p, now, SHUFFLE_REGISTERED_ONLINE_WINDOW_MS)), true);
assert.equal(isPublicShuffleOnline({ mostrarUltimaVez: false, presenceAt: registrationAt },
  (p) => isShuffleProfileOnline(p, now, SHUFFLE_REGISTERED_ONLINE_WINDOW_MS)), false,
  "Hidden-last-seen privacy must remain respected in Solo online");
console.log("PASS: Solo online privacy is unchanged for hidden-last-seen profiles");
