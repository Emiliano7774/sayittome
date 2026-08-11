/**
 * Cold deep-link Stories viewer: do not close loading on empty auth,
 * and A→B→A must refresh again (mutable lastViewer + generation).
 *
 * Usage: node scripts/story-deep-link-auth.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  createStoryDeepLinkViewerSession,
  shouldIgnorePreReadyAuthNull,
  markStoryDeepLinkAuthReady,
  shouldRefreshStoryViewer,
  planStoryDeepLinkViewer,
  shouldCloseStoryDeepLinkLoading,
} = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyDeepLinkSession.ts")).href
);
const { shouldPublishStoriesIndex } = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storiesQueryGuard.ts")).href
);

const pageSrc = fs.readFileSync(
  path.join(root, "src/app/stories/[username]/page.tsx"),
  "utf8",
);
const authorSrc = fs.readFileSync(
  path.join(root, "src/lib/stories/storyAuthor.ts"),
  "utf8",
);

assert.match(authorSrc, /export async function resolveStoryViewerIdReady/);
assert.match(authorSrc, /await auth\.authStateReady\(\)/);
assert.match(pageSrc, /resolveStoryViewerIdReady/);
assert.match(pageSrc, /subscribeStoriesIndex/);
assert.match(pageSrc, /getCachedStoryGroups/);
assert.match(pageSrc, /createStoryDeepLinkViewerSession/);
assert.match(pageSrc, /shouldIgnorePreReadyAuthNull/);
assert.doesNotMatch(
  pageSrc,
  /const viewerId = resolveStoryViewerId\(auth\.currentUser\)/,
);

// Cold deep-link: currentUser null before readiness must not close loading.
{
  const session = createStoryDeepLinkViewerSession();
  assert.equal(shouldIgnorePreReadyAuthNull(session.authReady, null), true);
  const early = planStoryDeepLinkViewer(session, "");
  assert.equal(early.action, "wait");
  assert.equal(early.closeLoading, false);
  assert.equal(
    shouldCloseStoryDeepLinkLoading({
      authReady: false,
      viewerId: "",
      requestGeneration: 0,
      settledGeneration: 0,
      hasGroup: false,
    }),
    false,
    "empty viewer before auth-ready must keep loading",
  );
}

// null -> UID after unique auth-ready
{
  const session = createStoryDeepLinkViewerSession();
  assert.equal(shouldIgnorePreReadyAuthNull(false, null), true);
  markStoryDeepLinkAuthReady(session);
  assert.equal(shouldIgnorePreReadyAuthNull(session.authReady, null), false);

  const stillEmpty = planStoryDeepLinkViewer(session, "");
  assert.equal(stillEmpty.action, "keep_loading");
  assert.equal(stillEmpty.closeLoading, false);

  const uid = planStoryDeepLinkViewer(session, "uid_alice");
  assert.equal(uid.action, "refresh");
  assert.equal(uid.viewerId, "uid_alice");
  assert.equal(uid.generation, 1);
  assert.equal(session.lastViewer, "uid_alice");
  assert.equal(
    shouldCloseStoryDeepLinkLoading({
      authReady: true,
      viewerId: "uid_alice",
      requestGeneration: 1,
      settledGeneration: 1,
      hasGroup: false,
    }),
    true,
  );
}

// null -> durable anon after auth-ready
{
  const session = createStoryDeepLinkViewerSession();
  markStoryDeepLinkAuthReady(session);
  const anon = planStoryDeepLinkViewer(session, "anon_durable");
  assert.equal(anon.action, "refresh");
  assert.equal(anon.viewerId, "anon_durable");
  assert.equal(
    shouldCloseStoryDeepLinkLoading({
      authReady: true,
      viewerId: "anon_durable",
      requestGeneration: 1,
      settledGeneration: 1,
      hasGroup: true,
    }),
    true,
  );
}

// A -> B -> A uses mutable lastViewer, not a frozen initial const
{
  const session = createStoryDeepLinkViewerSession();
  markStoryDeepLinkAuthReady(session);
  const a1 = planStoryDeepLinkViewer(session, "anon_A");
  const b = planStoryDeepLinkViewer(session, "anon_B");
  const a2 = planStoryDeepLinkViewer(session, "anon_A");
  assert.equal(a1.action, "refresh");
  assert.equal(b.action, "refresh");
  assert.equal(a2.action, "refresh");
  assert.deepEqual(
    [a1.generation, b.generation, a2.generation],
    [1, 2, 3],
    "returning to A after B must bump generation and refresh",
  );
  assert.equal(shouldRefreshStoryViewer("anon_A", "anon_B"), true);
  assert.equal(shouldRefreshStoryViewer("anon_A", "anon_A"), false);
  assert.equal(shouldRefreshStoryViewer("", "anon_A"), false);
}

assert.equal(
  shouldPublishStoriesIndex({
    requestToken: 1,
    liveToken: 2,
    requestViewer: "anon_A",
    liveViewer: "anon_B",
  }),
  false,
  "A->B out-of-order must not publish stale index",
);
assert.equal(
  shouldPublishStoriesIndex({
    requestToken: 2,
    liveToken: 2,
    requestViewer: "anon_B",
    liveViewer: "anon_B",
  }),
  true,
);

// Stale generation must not close loading for a superseded viewer
assert.equal(
  shouldCloseStoryDeepLinkLoading({
    authReady: true,
    viewerId: "anon_A",
    requestGeneration: 2,
    settledGeneration: 3,
    hasGroup: false,
  }),
  false,
);

console.log(
  JSON.stringify(
    {
      gate: "STORY_DEEP_LINK_AUTH",
      pass: true,
      cases: [
        "cold_null_keeps_loading",
        "null_to_uid",
        "null_to_anon",
        "A_to_B_to_A",
        "stale_generation",
        "ab_out_of_order_publish",
      ],
    },
    null,
    2,
  ),
);
