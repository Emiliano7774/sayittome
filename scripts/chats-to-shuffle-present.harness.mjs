/**
 * CHATS_TO_SHUFFLE_PRESENT
 * Repeated Chats→Shuffle must import the productive hide contract:
 * never hide the current shell until a real, unfrozen snapshot with
 * geometry/content is presented. No remount, no black placeholder.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const present = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleSnapshotPresent.ts")).href
);
const entry = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/instantShuffleEntry.ts")).href
);
const snapshot = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleViewportSnapshot.ts")).href
);

function card(width = 390, height = 420) {
  return {
    classList: { contains: (name) => name !== "sayittome-nav-scroll-spacer" },
    getAttribute: () => null,
    childNodes: [1],
    offsetWidth: width,
    offsetHeight: height,
    getBoundingClientRect: () => ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    }),
  };
}

function makeHost(state) {
  const cards = state.cards || [];
  return {
    classList: {
      contains(name) {
        if (name === "sayittome-shuffle-keepalive-visible") return state.visible;
        if (name === "sayittome-shuffle-keepalive-frozen") return state.frozen;
        return false;
      },
    },
    hasAttribute: (name) => Boolean(state.attrs?.[name]),
    getBoundingClientRect: () => ({
      width: state.width ?? 390,
      height: state.height ?? 700,
      top: 0,
      left: 0,
      right: 390,
      bottom: 700,
    }),
    querySelector(sel) {
      if (sel.includes("min-shell") && state.minShell) return { textContent: "Shuffle" };
      if (sel === "[data-shuffle-list]") {
        return {
          children: cards,
        };
      }
      return null;
    },
    querySelectorAll: () => cards,
  };
}

const chatsShell = makeHost({
  visible: false,
  frozen: true,
  cards: [],
  minShell: true,
  width: 390,
  height: 700,
});
assert.equal(present.canHideCurrentShellForShuffle(chatsShell), false);
assert.equal(present.hasRealShuffleFeedContent(chatsShell), false);

const emptyVisible = makeHost({
  visible: true,
  frozen: false,
  cards: [],
  minShell: true,
});
assert.equal(present.isRealShuffleSnapshotPresented(emptyVisible), false);

const real = makeHost({
  visible: true,
  frozen: false,
  cards: [card(), card(), card()],
});
assert.equal(present.isRealShuffleSnapshotPresented(real), true);

for (let hop = 1; hop <= 2; hop += 1) {
  const blocked = present.planChatsToShuffleReveal({ host: chatsShell, hop });
  assert.equal(blocked.hideCurrentShell, false);
  assert.equal(blocked.remount, false);
  assert.equal(blocked.allowBlackPlaceholder, false);

  const ready = present.planChatsToShuffleReveal({ host: real, hop });
  assert.equal(ready.hideCurrentShell, true);
  assert.equal(ready.presentHost, true);
  assert.equal(ready.remount, false);
}

const plan = entry.planInstantShuffleEntry({ fromPath: "/chats" });
assert.equal(plan.zone, "chats");
assert.equal(plan.remountHost, false);
assert.equal(plan.allowLoadingShell, false);

snapshot.captureShuffleViewportSnapshot({
  cardId: "sid:ada",
  index: 4,
  scrollTop: 640,
  cardIds: ["sid:a", "sid:b", "sid:c", "sid:d", "sid:ada"],
});
const kept = snapshot.captureShuffleViewportSnapshot({
  cardId: "",
  index: 0,
  scrollTop: 0,
});
assert.equal(kept.cardId, "sid:ada");
assert.equal(kept.scrollTop, 640);
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), true);

console.log(
  JSON.stringify(
    {
      gate: "CHATS_TO_SHUFFLE_PRESENT",
      pass: true,
      hops: 2,
    },
    null,
    2,
  ),
);
