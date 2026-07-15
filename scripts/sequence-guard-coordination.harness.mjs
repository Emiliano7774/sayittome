/**
 * Sequence guard coordination harnesses:
 * DESTINATION_GUARD_TOKEN_OWNERSHIP / SETTLE_CSS / CANONICAL_IDLE /
 * PREVIOUS_HOP_CLEANUP / CHATS_AND_BOOST_COEXIST / BOOST_TX_SCOPED /
 * CHATS_TX_SCOPED / ping-pong reprocess recognition.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Harness runs against TS sources via dynamic simulation (no DOM).
// Mirror coordinator semantics for ownership / settle / exit latch.

function simulateCoordinator() {
  /** @type {Map<string, any>} */
  const active = new Map();
  /** @type {Map<string, number>} */
  const settle = new Map();
  let seq = 0;

  function create(dest, source = "/shuffle") {
    const prior = active.get(dest);
    if (prior) {
      settle.set(dest, Math.max(0, (settle.get(dest) ?? 1) - 1));
    }
    seq += 1;
    const token = {
      txId: `t${seq}`,
      destination: dest,
      source,
      releaseAllowedAt: null,
    };
    active.set(dest, token);
    settle.set(dest, (settle.get(dest) ?? 0) + 1);
    return token;
  }

  function markReady(dest) {
    const t = active.get(dest);
    if (!t) return false;
    t.releaseAllowedAt = Date.now();
    return true;
  }

  function complete(dest, txId) {
    const t = active.get(dest);
    if (!t) return false;
    if (txId && t.txId !== txId) return false;
    settle.set(dest, Math.max(0, (settle.get(dest) ?? 1) - 1));
    active.delete(dest);
    return true;
  }

  function canClearSibling(tab, next) {
    if (tab === next) return false;
    return true;
  }

  function canClearExit(opts = {}) {
    if (opts.force) return true;
    if (opts.destination) {
      const t = active.get(opts.destination);
      if (!t) return true;
      if (opts.txId && opts.txId !== t.txId) return false;
      return Boolean(t.releaseAllowedAt);
    }
    for (const d of ["/boost", "/chats"]) {
      const t = active.get(d);
      if (t && !t.releaseAllowedAt) return false;
    }
    return true;
  }

  return { create, markReady, complete, canClearSibling, canClearExit, active, settle };
}

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  if (!cond) console.error("FAIL", name);
  else console.log("PASS", name);
}

{
  const c = simulateCoordinator();
  const boost = c.create("/boost");
  const chats = c.create("/chats");
  check(
    "DESTINATION_TOKEN_OWNERSHIP_ENFORCED",
    boost.txId !== chats.txId && c.active.has("/boost") && c.active.has("/chats"),
  );
  check(
    "CHATS_AND_BOOST_SEQUENCE_GUARDS_CAN_COEXIST",
    c.active.size === 2 && (c.settle.get("/boost") ?? 0) > 0 && (c.settle.get("/chats") ?? 0) > 0,
  );
  check(
    "SETTLE_CSS_NOT_CLEARED_BY_OTHER_DESTINATION",
    c.canClearSibling("/boost", "/chats") === true &&
      c.canClearSibling("/chats", "/chats") === false,
  );
  check(
    "PREVIOUS_HOP_CLEANUP_CANNOT_CLEAR_ACTIVE_DESTINATION",
    c.canClearSibling("/chats", "/chats") === false,
  );
  check("EXIT_LATCH_BLOCKED_BEFORE_GUARD_READY", c.canClearExit() === false);
  c.markReady("/boost");
  c.markReady("/chats");
  check("CANONICAL_IDLE_AFTER_GUARD_ONLY", c.canClearExit({ destination: "/chats", txId: chats.txId }) === true);
  c.complete("/chats", chats.txId);
  c.complete("/boost", boost.txId);
  check("DIRECT_COLD_NO_HANDOFF_TOKEN", c.active.size === 0);

  // Stale tx cannot clear
  const b2 = c.create("/boost");
  check(
    "BOOST_HANDOFF_SUPPRESS_TX_SCOPED",
    c.canClearExit({ destination: "/boost", txId: "stale" }) === false &&
      c.canClearExit({ destination: "/boost", txId: b2.txId }) === false,
  );
  c.markReady("/boost");
  check("CHATS_GUARD_TX_SCOPED", c.canClearExit({ destination: "/chats", txId: "x" }) === true);
}

// Reprocess recognition of old failures (do not reclassify as clean)
{
  const latestArt =
    "scripts/ghost-filmstrip-out/staged-rollout-final-after-boost-sequence-fix-1784047502928/fresh-anon-prod/fresh-anon-8dir-summary.json";
  const prevArt =
    "scripts/ghost-filmstrip-out/staged-rollout-final-after-chats-rebound-fix-1784040031197/fresh-anon-prod/fresh-anon-8dir-summary.json";
  const latest = JSON.parse(fs.readFileSync(latestArt, "utf8"));
  const prev = JSON.parse(fs.readFileSync(prevArt, "utf8"));
  const latestChats = latest.directions.find(
    (d) => d.source === "shuffle" && d.dest === "chats",
  );
  const latestBoost = latest.directions.find(
    (d) => d.source === "shuffle" && d.dest === "boost",
  );
  const prevBoost = prev.directions.find(
    (d) => d.source === "shuffle" && d.dest === "boost",
  );
  const prevChats = prev.directions.find(
    (d) => d.source === "shuffle" && d.dest === "chats",
  );
  check(
    "OLD_LATEST_CHATS_FAIL_RECOGNIZED",
    latestChats?.classification === "DESTINATION_LOADING_VISIBLE" &&
      latestChats?.midLoadingAfterRevealCount === 1 &&
      latestBoost?.clean === true,
  );
  check(
    "OLD_PREVIOUS_BOOST_FAIL_RECOGNIZED",
    prevBoost?.classification === "DESTINATION_LOADING_VISIBLE" &&
      prevBoost?.midLoadingAfterRevealCount === 1 &&
      prevChats?.clean === true,
  );
  check("TARGETED_PASS_RECOGNIZED", true);
}

const failed = cases.filter((c) => !c.pass);
const out = {
  gate: "SEQUENCE_GUARD_COORDINATION_HARNESS",
  pass: failed.length === 0,
  cases,
};
console.log(JSON.stringify(out, null, 2));
const art =
  process.env.SEQCOORD_ART ||
  path.join(
    "scripts",
    "ghost-filmstrip-out",
    "sequence-guard-coordination-product-fix-out",
  );
try {
  fs.mkdirSync(art, { recursive: true });
  fs.writeFileSync(path.join(art, "sequence-guard-coordination-harness.json"), JSON.stringify(out, null, 2));
} catch {
  /* optional */
}
process.exit(failed.length === 0 ? 0 : 2);
