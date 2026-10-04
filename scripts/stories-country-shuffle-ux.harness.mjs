/**
 * Stories like/return, country empty-state, and Shuffle unstick.
 *   node scripts/stories-country-shuffle-ux.harness.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const storyLike = read("src/lib/likes/storyLike.ts");
const viewer = read("src/components/stories/StoryViewer.tsx");
const groupsHook = read("src/hooks/useStoriesGroups.ts");
const indexStore = read("src/lib/stories/storiesIndexStore.ts");
const countries = read("src/lib/geo/countries.ts");
const audience = read("src/lib/geo/audience.ts");
const filters = read("src/lib/shuffle/filters.ts");
const emptyState = read("src/components/shuffle/ShuffleFiltersEmptyState.tsx");
const messages = read("src/lib/i18n/messages.ts");
const pool = read("src/hooks/useShufflePool.ts");
const modernNav = read("src/components/navigation/ModernBottomNav.tsx");
const classicNav = read("src/components/navigation/BottomNav.tsx");
const modernShuffle = read("src/app/shuffle/modern-shuffle-client.tsx");
const classicShuffle = read("src/app/shuffle/shuffle-client.tsx");

assert.match(storyLike, /export function persistStoryLike/);
assert.match(storyLike, /pendingLikes/);
assert.match(viewer, /persistStoryLike\(/);
assert.doesNotMatch(viewer, /await toggleStoryLike/);
assert.doesNotMatch(viewer, /if \(!likerId \|\| likerId === resolvedOwnerUid\) return/);
assert.match(indexStore, /export function peekCachedStoryGroups/);
assert.match(groupsHook, /peekCachedStoryGroups\(\)/);

assert.match(countries, /export function resolveCountryCode/);
assert.match(countries, /countryByName\.get\(normalizeGeoValue\(raw\)\)/);
assert.match(audience, /resolveCountryCode\(value\)/);

assert.match(filters, /export function hasDiscoveryCountryFilter/);
assert.match(filters, /export function stripDiscoveryCountry/);
assert.match(emptyState, /shuffle_no_profiles_country/);
assert.match(emptyState, /shuffle_filters_switch_general/);
assert.match(emptyState, /data-shuffle-switch-general/);
assert.match(messages, /¡No encontramos a nadie de tu zona!/);
assert.match(messages, /Cambiar a búsqueda general/);
assert.match(modernShuffle, /onSwitchToGeneralSearch=\{pool\.clearDiscoveryCountry\}/);
assert.match(classicShuffle, /onSwitchToGeneralSearch=\{pool\.clearDiscoveryCountry\}/);

assert.match(pool, /shuffle-click-reload/);
assert.match(pool, /clearDiscoveryCountry/);
assert.match(modernNav, /if \(livePath === "\/shuffle"\) \{\s*triggerShuffleClick\(\);/);
assert.match(classicNav, /if \(livePath === "\/shuffle"\) \{\s*triggerShuffleClick\(\);/);

console.log("stories-country-shuffle-ux: ok");
