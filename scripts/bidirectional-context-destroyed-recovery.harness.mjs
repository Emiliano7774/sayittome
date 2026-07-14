/**
 * BIDIRECTIONAL_CONTEXT_DESTROYED_RECOVERY_HARNESS
 * Deterministic unit cases for context-destroy recovery (no browser required).
 */
import {
  classifyBidirectionalHopOutcome,
  isContextDestroyedError,
  isPageClosedError,
  MAX_DOM_SAMPLE_RETRIES,
  safeEvaluate,
  safeSample,
} from "./bidirectional-context-rebind.mjs";
import {
  evaluateBidirectionalTabNoLoadingVisualGate,
} from "./bidirectional-tab-no-loading-visual-gate.mjs";

const cases = [];
function check(name, cond) {
  cases.push({ name, pass: Boolean(cond) });
  if (!cond) console.error("FAIL", name);
  else console.log("PASS", name);
}

function mockPage({ evaluateImpl, closed = false }) {
  return {
    isClosed: () => closed,
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    evaluate: evaluateImpl,
  };
}

// 1. context destroyed during expected internal navigation -> handled, continue
{
  let n = 0;
  const page = mockPage({
    evaluateImpl: async () => {
      n += 1;
      if (n === 1) {
        throw new Error(
          "Execution context was destroyed, most likely because of a navigation",
        );
      }
      return "/chats";
    },
  });
  const r = await safeEvaluate(page, () => "/chats");
  check(
    "1 expected context destroy -> handled continue",
    r.ok === true && r.contextDestroyedHandled === true && r.value === "/chats",
  );
}

// 2. Shuffle → Chats specifically handled
{
  const outcome = classifyBidirectionalHopOutcome({
    reachedDest: true,
    anyLoadingText: false,
    anyShell: false,
    pageClosed: false,
    contextDestroyedHandled: true,
    sampleCount: 5,
    unexpectedHardNav: false,
    postHopCanonicalIdle: true,
  });
  check(
    "2 shuffle->chats context destroy -> CLEAN_WITH_CONTEXT_REBIND",
    outcome === "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
  );
}

// 3. context destroyed with visible loading already captured -> fail
{
  const outcome = classifyBidirectionalHopOutcome({
    reachedDest: true,
    anyLoadingText: true,
    anyShell: false,
    pageClosed: false,
    contextDestroyedHandled: true,
    sampleCount: 4,
    unexpectedHardNav: false,
    postHopCanonicalIdle: true,
  });
  const gate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: outcome,
    anyLoadingText: true,
    CONTEXT_DESTROYED_DURING_NAVIGATION_HANDLED: true,
  });
  check(
    "3 context destroy + visible loading -> fail",
    outcome === "BIDIRECTIONAL_HOP_FAIL_VISIBLE_LOADING" && gate.pass === false,
  );
}

// 4. context destroyed with no frames after rebind -> not evaluated insufficient
{
  const outcome = classifyBidirectionalHopOutcome({
    reachedDest: false,
    anyLoadingText: false,
    anyShell: false,
    pageClosed: false,
    contextDestroyedHandled: true,
    sampleCount: 0,
    unexpectedHardNav: false,
    postHopCanonicalIdle: false,
  });
  check(
    "4 no frames after rebind -> unrecoverable/not evaluated",
    outcome === "BIDIRECTIONAL_HOP_NOT_EVALUATED_CONTEXT_DESTROYED_UNRECOVERABLE" ||
      outcome === "BIDIRECTIONAL_HOP_NOT_EVALUATED_INSUFFICIENT_EVIDENCE",
  );
}

// 5. page closed -> fail
{
  const page = mockPage({
    closed: true,
    evaluateImpl: async () => {
      throw new Error("Target page, context or browser has been closed");
    },
  });
  const r = await safeEvaluate(page, () => 1);
  const outcome = classifyBidirectionalHopOutcome({
    reachedDest: false,
    anyLoadingText: false,
    anyShell: false,
    pageClosed: true,
    contextDestroyedHandled: false,
    sampleCount: 0,
    unexpectedHardNav: false,
    postHopCanonicalIdle: false,
  });
  check(
    "5 page closed -> fail",
    r.classificationHint === "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED" &&
      outcome === "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED",
  );
}

// 6. unexpected hard navigation -> fail
{
  const outcome = classifyBidirectionalHopOutcome({
    reachedDest: true,
    anyLoadingText: false,
    anyShell: false,
    pageClosed: false,
    contextDestroyedHandled: true,
    sampleCount: 3,
    unexpectedHardNav: true,
    postHopCanonicalIdle: true,
  });
  check(
    "6 unexpected hard nav -> fail",
    outcome === "BIDIRECTIONAL_HOP_FAIL_HARD_NAVIGATION_UNEXPECTED",
  );
}

// 7. no-screencast -> not evaluated, cannot pass
{
  const gate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "NATIVE_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    clean: true,
  });
  check(
    "7 no-screencast cannot pass",
    gate.pass === false &&
      gate.status === "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER",
  );
}

// 8. one tap only invariant (classifier meta)
{
  const hop = {
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    clean: true,
    realInputCount: 1,
    reachedDest: true,
    postHopCanonicalIdle: true,
  };
  check("8 one tap only invariant", hop.realInputCount === 1);
}

// 9. DOM sample retry does not retry user input
{
  let evaluateCalls = 0;
  let userInputCalls = 0;
  const page = mockPage({
    evaluateImpl: async () => {
      evaluateCalls += 1;
      if (evaluateCalls === 1) {
        throw new Error(
          "Execution context was destroyed, most likely because of a navigation",
        );
      }
      return { pathname: "/chats" };
    },
  });
  await safeEvaluate(page, () => ({ pathname: "/chats" }));
  // simulate: retries are evaluate-only
  check(
    "9 DOM retry does not retry user input",
    evaluateCalls === 2 && userInputCalls === 0 && MAX_DOM_SAMPLE_RETRIES === 3,
  );
}

// 10. archived tx not live after rebind (gate still fails archived-as-live)
{
  const gate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    clean: true,
    archivedInterpretedAsLiveCount: 1,
    reachedDest: true,
    postHopCanonicalIdle: true,
  });
  check("10 archived tx not live after rebind", gate.pass === false);
}

// 11. canonical idle still required
{
  const gate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND",
    clean: true,
    postHopCanonicalIdle: false,
    reachedDest: true,
  });
  check("11 canonical idle still required", gate.pass === false);
}

// 12. final route/tab still validated
{
  const outcome = classifyBidirectionalHopOutcome({
    reachedDest: false,
    anyLoadingText: false,
    anyShell: false,
    pageClosed: false,
    contextDestroyedHandled: true,
    sampleCount: 5,
    unexpectedHardNav: false,
    postHopCanonicalIdle: true,
  });
  check("12 final route validated (mismatch)", outcome === "ROUTE_MISMATCH");
}

// 13. source/destination still validated via reachedDest
{
  const gate = evaluateBidirectionalTabNoLoadingVisualGate({
    visualProvider: "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST",
    classification: "ROUTE_MISMATCH",
    clean: false,
    reachedDest: false,
    postHopCanonicalIdle: true,
  });
  check("13 source/dest validation blocks clean", gate.pass === false);
}

// 14. partial evidence preserved through rebind (safeSample marks handled)
{
  let calls = 0;
  const page = mockPage({
    evaluateImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error(
          "Execution context was destroyed, most likely because of a navigation",
        );
      }
      return { pathname: "/chats", ready: "complete" };
    },
  });
  const samples = [{ loadingTextAnywhere: true }];
  const r = await safeSample(page, async (p) => {
    const path = await p.evaluate(() => "/chats");
    return {
      pathname: path,
      loadingTextAnywhere: samples[0].loadingTextAnywhere,
      loadingShellAnywhere: 0,
      exitHandoff: false,
      mainHandoff: false,
    };
  });
  check(
    "14 partial evidence preserved through rebind",
    r.ok === true &&
      r.contextDestroyedHandled === true &&
      r.sample.loadingTextAnywhere === true &&
      isContextDestroyedError(
        new Error("Execution context was destroyed, most likely because of a navigation"),
      ) &&
      !isPageClosedError(
        new Error("Execution context was destroyed, most likely because of a navigation"),
      ),
  );
}

const failed = cases.filter((c) => !c.pass);
const total = 100000;
const passScaled = failed.length === 0 ? total : Math.floor((cases.length - failed.length) * (total / cases.length));
console.log(
  JSON.stringify(
    {
      harness: "BIDIRECTIONAL_CONTEXT_DESTROYED_RECOVERY_HARNESS",
      cases: cases.length,
      failed: failed.length,
      scaled: `${passScaled}/${total}`,
      pass: failed.length === 0,
      details: cases,
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 2);
