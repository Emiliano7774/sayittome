/**
 * Bidirectional probe helpers: survive "Execution context was destroyed"
 * during expected internal tab navigation without retrying user input.
 */

export const CONTEXT_DESTROYED_RE =
  /Execution context was destroyed|Target closed|Frame was detached|Protocol error.*navigat/i;

export const MAX_DOM_SAMPLE_RETRIES = 3;
export const REBIND_WAIT_MS = 150;

export function isContextDestroyedError(err) {
  const msg = String(err?.message || err || "");
  return CONTEXT_DESTROYED_RE.test(msg);
}

export function isPageClosedError(err) {
  const msg = String(err?.message || err || "");
  // Prefer the explicit Playwright closed-page message; bare "Target closed"
  // often appears during soft navigation context teardown.
  return /Target page, context or browser has been closed/i.test(msg);
}

/**
 * Bounded page.evaluate with rebind waits. Never retries user input.
 * @returns {{ ok: boolean, value?: any, attempts: number, contextDestroyedHandled: boolean, error?: string }}
 */
export async function safeEvaluate(page, fn, arg, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? MAX_DOM_SAMPLE_RETRIES;
  const waitMs = opts.waitMs ?? REBIND_WAIT_MS;
  let attempts = 0;
  let contextDestroyedHandled = false;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      if (page.isClosed?.()) {
        return {
          ok: false,
          attempts,
          contextDestroyedHandled,
          error: "PAGE_CLOSED",
          classificationHint: "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED",
        };
      }
      const value = arg === undefined ? await page.evaluate(fn) : await page.evaluate(fn, arg);
      return { ok: true, value, attempts, contextDestroyedHandled };
    } catch (err) {
      lastError = err;
      if (isPageClosedError(err) && !isContextDestroyedError(err)) {
        return {
          ok: false,
          attempts,
          contextDestroyedHandled,
          error: String(err?.message || err),
          classificationHint: "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED",
        };
      }
      if (isContextDestroyedError(err)) {
        contextDestroyedHandled = true;
        if (attempts >= maxAttempts) break;
        await page.waitForTimeout(waitMs).catch(() => {});
        // Prefer waiting for load/domcontentloaded if navigating.
        try {
          await page.waitForLoadState("domcontentloaded", { timeout: 2000 });
        } catch {
          /* ignore */
        }
        continue;
      }
      // Unexpected evaluate error — do not infinite-loop
      return {
        ok: false,
        attempts,
        contextDestroyedHandled,
        error: String(err?.message || err),
        classificationHint: "BIDIRECTIONAL_HOP_NOT_EVALUATED_CONTEXT_DESTROYED_UNRECOVERABLE",
      };
    }
  }

  return {
    ok: false,
    attempts,
    contextDestroyedHandled,
    error: String(lastError?.message || lastError || "context-destroyed-exhausted"),
    classificationHint: contextDestroyedHandled
      ? "BIDIRECTIONAL_HOP_NOT_EVALUATED_CONTEXT_DESTROYED_UNRECOVERABLE"
      : "BIDIRECTIONAL_HOP_NOT_EVALUATED_INSUFFICIENT_EVIDENCE",
  };
}

/**
 * Wait until pathname matches dest, using safeEvaluate only (no second tap).
 */
export async function waitForDestinationPath(page, dest, opts = {}) {
  const deadlineMs = opts.deadlineMs ?? 6000;
  const deadline = Date.now() + deadlineMs;
  let contextDestroyedHandled = false;
  let attempts = 0;
  const navEvents = [];

  while (Date.now() < deadline) {
    const r = await safeEvaluate(page, () => location.pathname);
    attempts += r.attempts;
    if (r.contextDestroyedHandled) {
      contextDestroyedHandled = true;
      navEvents.push({
        t: Date.now(),
        event: "CONTEXT_DESTROYED_DURING_NAVIGATION_HANDLED",
        attempt: attempts,
      });
    }
    if (r.ok && r.value === `/${dest}`) {
      return {
        reached: true,
        pathname: r.value,
        contextDestroyedHandled,
        attempts,
        navEvents,
        FRAME_REBOUND_AFTER_NAVIGATION: contextDestroyedHandled,
      };
    }
    if (!r.ok && r.classificationHint === "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED") {
      return {
        reached: false,
        pathname: null,
        contextDestroyedHandled,
        attempts,
        navEvents,
        pageClosed: true,
        classificationHint: r.classificationHint,
      };
    }
    await page.waitForTimeout(100).catch(() => {});
  }

  const final = await safeEvaluate(page, () => location.pathname);
  if (final.contextDestroyedHandled) contextDestroyedHandled = true;
  attempts += final.attempts;
  return {
    reached: final.ok && final.value === `/${dest}`,
    pathname: final.ok ? final.value : null,
    contextDestroyedHandled,
    attempts,
    navEvents,
    FRAME_REBOUND_AFTER_NAVIGATION: contextDestroyedHandled,
  };
}

/**
 * Safe DOM sample wrapper around a page.evaluate-based sampler.
 */
export async function safeSample(page, sampleFn) {
  try {
    if (page.isClosed?.()) {
      return {
        ok: false,
        sample: null,
        contextDestroyedHandled: false,
        classificationHint: "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED",
      };
    }
    const sample = await sampleFn(page);
    return { ok: true, sample, contextDestroyedHandled: false };
  } catch (err) {
    if (isPageClosedError(err) && !isContextDestroyedError(err)) {
      return {
        ok: false,
        sample: null,
        contextDestroyedHandled: false,
        error: String(err?.message || err),
        classificationHint: "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED",
      };
    }
    if (isContextDestroyedError(err)) {
      const rebound = await safeEvaluate(page, () => ({
        pathname: location.pathname,
        ready: document.readyState,
      }));
      if (!rebound.ok) {
        return {
          ok: false,
          sample: null,
          contextDestroyedHandled: true,
          error: String(err?.message || err),
          classificationHint: rebound.classificationHint,
        };
      }
      try {
        await page.waitForTimeout(REBIND_WAIT_MS);
        const sample = await sampleFn(page);
        return {
          ok: true,
          sample,
          contextDestroyedHandled: true,
          DOM_SAMPLE_RETRY_AFTER_CONTEXT_REBIND: true,
        };
      } catch (err2) {
        return {
          ok: false,
          sample: null,
          contextDestroyedHandled: true,
          error: String(err2?.message || err2),
          classificationHint: "BIDIRECTIONAL_HOP_NOT_EVALUATED_INSUFFICIENT_EVIDENCE",
        };
      }
    }
    return {
      ok: false,
      sample: null,
      contextDestroyedHandled: false,
      error: String(err?.message || err),
      classificationHint: "BIDIRECTIONAL_HOP_NOT_EVALUATED_INSUFFICIENT_EVIDENCE",
    };
  }
}

/**
 * Map hop meta + samples into classifier taxonomy labels.
 */
export function classifyBidirectionalHopOutcome({
  reachedDest,
  anyLoadingText,
  anyShell,
  pageClosed,
  contextDestroyedHandled,
  sampleCount,
  unexpectedHardNav,
  postHopCanonicalIdle,
}) {
  if (pageClosed) return "BIDIRECTIONAL_HOP_FAIL_PAGE_CLOSED";
  if (unexpectedHardNav) return "BIDIRECTIONAL_HOP_FAIL_HARD_NAVIGATION_UNEXPECTED";
  if (anyLoadingText || anyShell) return "BIDIRECTIONAL_HOP_FAIL_VISIBLE_LOADING";
  if (!reachedDest && sampleCount === 0 && contextDestroyedHandled) {
    return "BIDIRECTIONAL_HOP_NOT_EVALUATED_CONTEXT_DESTROYED_UNRECOVERABLE";
  }
  if (!reachedDest && sampleCount < 2) {
    return "BIDIRECTIONAL_HOP_NOT_EVALUATED_INSUFFICIENT_EVIDENCE";
  }
  if (reachedDest && !anyLoadingText && !anyShell && postHopCanonicalIdle !== false) {
    return contextDestroyedHandled
      ? "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND"
      : "CLEAN";
  }
  if (reachedDest && !anyLoadingText && !anyShell) {
    return contextDestroyedHandled
      ? "BIDIRECTIONAL_HOP_CLEAN_WITH_CONTEXT_REBIND"
      : "CLEAN";
  }
  if (!reachedDest) return "ROUTE_MISMATCH";
  return "BIDIRECTIONAL_HOP_NOT_EVALUATED_INSUFFICIENT_EVIDENCE";
}
