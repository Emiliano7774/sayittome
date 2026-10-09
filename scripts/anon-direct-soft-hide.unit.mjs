import assert from "node:assert/strict";
import {
  anonDirectCanHideChat,
  anonDirectIsHiddenForViewer,
  anonDirectMessageMarker,
} from "../src/lib/chat/anonDirectHidePolicy.ts";

assert.equal(anonDirectCanHideChat("uidA", "uidA", "uidB"), true);
assert.equal(anonDirectCanHideChat("uidB", "uidA", "uidB"), true);
assert.equal(anonDirectCanHideChat("intruder", "uidA", "uidB"), false);
assert.equal(anonDirectCanHideChat("", "uidA", "uidB"), false);

assert.equal(anonDirectMessageMarker("m1", 5), "m:m1");
assert.equal(anonDirectMessageMarker("", 175), "t:175");
assert.equal(anonDirectMessageMarker("", 0), "__empty__");

const hidden = { uidA: "m:m1" };
assert.equal(anonDirectIsHiddenForViewer("uidA", hidden, "m1", 0), true);
assert.equal(anonDirectIsHiddenForViewer("uidB", hidden, "m1", 0), false);
assert.equal(anonDirectIsHiddenForViewer("uidA", hidden, "m2", 0), false);
assert.equal(anonDirectIsHiddenForViewer("intruder", hidden, "m1", 0), false);
assert.equal(anonDirectIsHiddenForViewer("uidA", { uidA: "__empty__" }, "", 0), true);

console.log("PASS ANON DIRECT SOFT HIDE UNIT: member authorization, per-user hide, resurfacing and empty threads");
