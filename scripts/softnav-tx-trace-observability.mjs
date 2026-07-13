/**
 * Soft-nav TX + main-trace archive observability (tooling only).
 * Merge / resolve / classify — never drives product navigation.
 */

export const OUTCOME = {
  FULL_TX_RESOLVED: "FULL_TX_RESOLVED",
  SOFTNAV_TX_ONLY: "SOFTNAV_TX_ONLY",
  SOFTNAV_TX_WITH_TRACE_RESET: "SOFTNAV_TX_WITH_TRACE_RESET",
  SOFTNAV_TX_WITHOUT_PIN: "SOFTNAV_TX_WITHOUT_PIN",
  PIN_TX_WITHOUT_MAIN_TRACE: "PIN_TX_WITHOUT_MAIN_TRACE",
  NO_TX_CANDIDATE: "NO_TX_CANDIDATE",
  TRACE_ARCHIVE_EXPIRED: "TRACE_ARCHIVE_EXPIRED",
};

export const LABEL = {
  SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET: "SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET",
  SOFTNAV_TX_WITHOUT_PIN_EVENT: "SOFTNAV_TX_WITHOUT_PIN_EVENT",
  MAIN_TRACE_RING_RESET_AFTER_SOFT_PUSH: "MAIN_TRACE_RING_RESET_AFTER_SOFT_PUSH",
  PRESENTATION_RUNTIME_CREATED_AFTER_SOFT_PUSH: "PRESENTATION_RUNTIME_CREATED_AFTER_SOFT_PUSH",
  POST_SOFT_PUSH_RUNTIME_REINIT_OR_REALM_WIPE: "POST_SOFT_PUSH_RUNTIME_REINIT_OR_REALM_WIPE",
  LEGACY_REVEAL_AFTER_TRACE_RESET: "LEGACY_REVEAL_AFTER_TRACE_RESET",
  PIN_DIAG_NOT_CAPTURED: "PIN_DIAG_NOT_CAPTURED",
  TX_PIN_DIAG_EXPORT_MISSING: "TX_PIN_DIAG_EXPORT_MISSING",
  TRACE_ARCHIVE_EXPIRED: "TRACE_ARCHIVE_EXPIRED",
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function eventTxId(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id =
    entry.transactionId ??
    entry.txId ??
    entry.currentTransactionId ??
    entry.scheduledTransactionId ??
    null;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function eventMono(entry) {
  return typeof entry?.monoMs === "number" ? entry.monoMs : null;
}

function eventKind(entry) {
  return typeof entry?.kind === "string" ? entry.kind : "";
}

function dedupeKey(entry, source) {
  return [
    eventMono(entry) ?? "",
    eventKind(entry),
    eventTxId(entry) ?? "",
    entry?.navSeq ?? "",
    source ?? entry?.archiveSource ?? entry?.mergeSource ?? "",
  ].join("|");
}

/**
 * Merge multiple trace sources. Never overwrite non-empty with empty.
 */
export function mergeTraceSources(input = {}) {
  const {
    mainTraceCurrent = [],
    traceArchiveEvents = [],
    softNavDiag = [],
    pinDiagEvents = [],
    runtimeLifecycle = [],
    navInputDiag = [],
  } = input;

  const main = asArray(mainTraceCurrent);
  const archive = asArray(traceArchiveEvents);
  const soft = asArray(softNavDiag);
  const pin = asArray(pinDiagEvents);
  const runtime = asArray(runtimeLifecycle);
  const nav = asArray(navInputDiag);

  const labeled = [
    ...main.map((e) => ({ ...e, mergeSource: e.mergeSource ?? "mainTraceCurrent" })),
    ...archive.map((e) => ({ ...e, mergeSource: e.mergeSource ?? "traceArchive" })),
    ...soft.map((e) => ({
      ...e,
      mergeSource: e.mergeSource ?? "softNavDiag",
      // Normalize soft-nav diag into trace-like shape for resolver visibility.
      transactionId: eventTxId(e),
      kind: e.kind ?? "SOFT_NAV_DIAG",
    })),
    ...pin.map((e) => ({
      ...e,
      mergeSource: e.mergeSource ?? "pinDiag",
      transactionId: eventTxId(e),
    })),
    ...runtime.map((e) => ({ ...e, mergeSource: e.mergeSource ?? "runtimeLifecycle" })),
    ...nav.map((e) => ({ ...e, mergeSource: e.mergeSource ?? "navInputDiag" })),
  ];

  const byKey = new Map();
  for (const entry of labeled) {
    const key = dedupeKey(entry, entry.mergeSource);
    if (!byKey.has(key)) byKey.set(key, entry);
  }

  const merged = [...byKey.values()].sort(
    (a, b) => (eventMono(a) ?? 0) - (eventMono(b) ?? 0),
  );

  const nonEmptyPreserved =
    (main.length === 0 || merged.some((e) => e.mergeSource === "mainTraceCurrent")) &&
    (archive.length === 0 ||
      merged.some((e) => e.mergeSource === "traceArchive" || e.archiveSource)) &&
    !(main.length > 0 && merged.length === 0);

  return {
    merged,
    invariants: {
      NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY: nonEmptyPreserved,
      SOFTNAV_DIAG_MERGED_INTO_CURRENT_HOP: soft.length === 0 || soft.every((s) =>
        merged.some((m) => m.mergeSource === "softNavDiag" && eventTxId(m) === eventTxId(s)),
      ) || soft.length > 0 && merged.some((m) => m.mergeSource === "softNavDiag"),
      PIN_DIAG_MERGED_INTO_CURRENT_HOP:
        pin.length === 0 || merged.some((m) => m.mergeSource === "pinDiag"),
      TRACE_ARCHIVE_MERGED_INTO_CURRENT_HOP:
        archive.length === 0 ||
        merged.some((m) => m.mergeSource === "traceArchive" || m.archiveSource),
      MAIN_TRACE_EMPTY_WITH_SOFTNAV_TX_CLASSIFIED: true,
    },
    counts: {
      main: main.length,
      archive: archive.length,
      softNav: soft.length,
      pin: pin.length,
      runtime: runtime.length,
      nav: nav.length,
      merged: merged.length,
    },
  };
}

/**
 * Prefer longer non-empty array when merging report fields.
 */
export function preferNonEmptyTrace(previous, next) {
  const a = asArray(previous);
  const b = asArray(next);
  if (a.length > 0 && b.length === 0) {
    return {
      value: a,
      NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY: true,
      preserved: true,
    };
  }
  if (b.length >= a.length) {
    return {
      value: b,
      NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY: true,
      preserved: false,
    };
  }
  return {
    value: a,
    NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY: true,
    preserved: true,
  };
}

function extractSoftNavTx(softNavDiag, captureStartMono = 0) {
  const events = asArray(softNavDiag).filter(
    (e) =>
      eventTxId(e) &&
      (captureStartMono <= 0 || (eventMono(e) ?? 0) >= captureStartMono - 50),
  );
  if (!events.length) return null;
  const last = events[events.length - 1];
  return {
    txId: eventTxId(last),
    phase: last.phase ?? null,
    activeTx: Boolean(last.transactionId || last.txId),
    events,
    softPushMono:
      events.find((e) => String(e.kind).includes("SOFT_ROUTER_PUSH"))?.monoMs ??
      events[0]?.monoMs ??
      null,
  };
}

function extractPinEvents(pinDiag) {
  if (!pinDiag) return { events: [], exportMissing: true, exportEmpty: true };
  if (pinDiag === "MISSING") {
    return { events: [], exportMissing: true, exportEmpty: true };
  }
  if (Array.isArray(pinDiag)) {
    return { events: pinDiag, exportMissing: false, exportEmpty: pinDiag.length === 0 };
  }
  const events = asArray(pinDiag.pinHistory ?? pinDiag.events);
  return {
    events,
    exportMissing: pinDiag.exportAvailable === false,
    exportEmpty: events.length === 0,
    activePin: pinDiag.activePin ?? null,
    byTxId: pinDiag.byTxId ?? {},
  };
}

function extractArchiveEvents(traceArchive) {
  if (!traceArchive) return { events: [], expired: false, byTxId: {} };
  if (traceArchive.expired === true || traceArchive.TRACE_ARCHIVE_EXPIRED === true) {
    return { events: asArray(traceArchive.events), expired: true, byTxId: traceArchive.byTxId ?? {} };
  }
  const events = asArray(
    traceArchive.events ??
      Object.values(traceArchive.byTxId ?? {}).flatMap((b) => asArray(b?.events)),
  );
  return { events, expired: false, byTxId: traceArchive.byTxId ?? {} };
}

function mainTraceHasTxPhases(mainTrace, txId) {
  const events = asArray(mainTrace).filter((e) => !txId || eventTxId(e) === txId);
  const kinds = new Set(events.map(eventKind));
  return {
    hasBegin: kinds.has("TRANSITION_BEGIN") || kinds.has("TRANSACTION_REF_ASSIGNED"),
    hasArmed: kinds.has("PHASE_ARMED"),
    hasSliding: kinds.has("PHASE_SLIDING"),
    hasTe:
      kinds.has("TRANSITION_END") ||
      kinds.has("TRANSITION_END_RECEIVED") ||
      kinds.has("SETTLED"),
    length: events.length,
  };
}

function detectResetAfterSoftPush(merged, softPushMono) {
  if (softPushMono == null) {
    return {
      traceResetAfterSoftPush: false,
      runtimeCreatedAfterSoftPush: false,
      legacyRevealAfterReset: false,
      postSoftPushRuntimeReinitOrRealmWipe: false,
    };
  }
  const after = asArray(merged).filter((e) => (eventMono(e) ?? 0) > softPushMono);
  const ringCreated = after.some((e) => eventKind(e) === "TRACE_RING_CREATED");
  const runtimeCreated = after.some((e) => eventKind(e) === "PRESENTATION_RUNTIME_CREATED");
  const archivedBeforeReset = after.some(
    (e) =>
      eventKind(e) === "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET" ||
      eventKind(e) === "TRACE_RING_RESET_WITH_ACTIVE_OR_RECENT_TX",
  );
  const legacyAfter =
    (ringCreated || runtimeCreated || archivedBeforeReset) &&
    after.some(
      (e) =>
        eventKind(e) === "LEGACY_REVEAL_EXECUTED" ||
        eventKind(e) === "LEGACY_REVEAL_ATTEMPT",
    );
  return {
    traceResetAfterSoftPush: ringCreated || archivedBeforeReset,
    runtimeCreatedAfterSoftPush: runtimeCreated,
    legacyRevealAfterReset: legacyAfter,
    postSoftPushRuntimeReinitOrRealmWipe: runtimeCreated && ringCreated,
  };
}

/**
 * Multi-source current-hop resolver.
 * Soft-nav TX never collapses to generic NO_TX when softNavDiag has a tx.
 */
export function resolveSoftNavAwareCurrentHop(input = {}) {
  const {
    mainTraceCurrent = [],
    traceArchive = null,
    softNavDiag = [],
    pinDiag = null,
    runtimeLifecycle = [],
    navInputDiag = [],
    captureStartMono = 0,
    pinDiagCaptured = null,
  } = input;

  const main = asArray(mainTraceCurrent);
  const archiveInfo = extractArchiveEvents(traceArchive);
  const soft = extractSoftNavTx(softNavDiag, captureStartMono);
  const pinInfo = extractPinEvents(pinDiag);
  const merge = mergeTraceSources({
    mainTraceCurrent: main,
    traceArchiveEvents: archiveInfo.events,
    softNavDiag: softNavDiag,
    pinDiagEvents: pinInfo.events,
    runtimeLifecycle,
    navInputDiag,
  });

  const labels = [];
  const softPushMono = soft?.softPushMono ?? null;
  const reset = detectResetAfterSoftPush(
    [...merge.merged, ...asArray(runtimeLifecycle)],
    softPushMono,
  );

  if (pinDiagCaptured === false || pinInfo.exportMissing) {
    labels.push(LABEL.PIN_DIAG_NOT_CAPTURED);
    if (pinInfo.exportMissing) labels.push(LABEL.TX_PIN_DIAG_EXPORT_MISSING);
  }

  if (archiveInfo.expired) {
    labels.push(LABEL.TRACE_ARCHIVE_EXPIRED);
  }

  if (reset.traceResetAfterSoftPush) {
    labels.push(LABEL.MAIN_TRACE_RING_RESET_AFTER_SOFT_PUSH);
    labels.push(LABEL.SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET);
  }
  if (reset.runtimeCreatedAfterSoftPush) {
    labels.push(LABEL.PRESENTATION_RUNTIME_CREATED_AFTER_SOFT_PUSH);
  }
  if (reset.postSoftPushRuntimeReinitOrRealmWipe) {
    labels.push(LABEL.POST_SOFT_PUSH_RUNTIME_REINIT_OR_REALM_WIPE);
  }
  if (reset.legacyRevealAfterReset) {
    labels.push(LABEL.LEGACY_REVEAL_AFTER_TRACE_RESET);
  }

  const archiveTxIds = Object.keys(archiveInfo.byTxId || {});
  const archivedForSoft = soft?.txId && archiveInfo.byTxId?.[soft.txId];
  const pinForSoft =
    soft?.txId &&
    (pinInfo.activePin?.txId === soft.txId ||
      pinInfo.events.some((e) => eventTxId(e) === soft.txId) ||
      Boolean(pinInfo.byTxId?.[soft.txId]));

  const mainPhases = mainTraceHasTxPhases(main, soft?.txId ?? null);
  const archivePhases = mainTraceHasTxPhases(archiveInfo.events, soft?.txId ?? null);
  const combinedPhases = {
    hasBegin: mainPhases.hasBegin || archivePhases.hasBegin,
    hasArmed: mainPhases.hasArmed || archivePhases.hasArmed,
    hasSliding: mainPhases.hasSliding || archivePhases.hasSliding,
    hasTe: mainPhases.hasTe || archivePhases.hasTe,
  };

  let outcome = OUTCOME.NO_TX_CANDIDATE;
  let transactionId = null;
  let evaluationStatus = "NO_TX_CANDIDATE";
  let cleanEligible = false;

  if (soft?.txId) {
    transactionId = soft.txId;
    if (!pinForSoft && pinDiagCaptured !== false) {
      labels.push(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT);
    }

    if (combinedPhases.hasBegin && (combinedPhases.hasArmed || combinedPhases.hasSliding)) {
      outcome = OUTCOME.FULL_TX_RESOLVED;
      evaluationStatus = "FULL_TX_RESOLVED";
      cleanEligible = combinedPhases.hasArmed && combinedPhases.hasSliding && combinedPhases.hasTe;
    } else if (reset.traceResetAfterSoftPush || reset.runtimeCreatedAfterSoftPush) {
      outcome = OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET;
      evaluationStatus =
        archivedForSoft || archiveInfo.events.length
          ? "MAIN_TRACE_RESET_AFTER_SOFT_PUSH"
          : "SOFTNAV_TX_WITHOUT_MAIN_TRACE";
      labels.push(LABEL.SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET);
    } else if (mainPhases.length === 0 && !archivePhases.hasBegin) {
      outcome = OUTCOME.SOFTNAV_TX_ONLY;
      evaluationStatus = "SOFTNAV_TX_WITHOUT_MAIN_TRACE";
      labels.push(LABEL.SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET);
    } else {
      outcome = OUTCOME.SOFTNAV_TX_ONLY;
      evaluationStatus = "SOFTNAV_TX_WITHOUT_MAIN_TRACE";
    }

    if (!pinForSoft) {
      if (pinDiagCaptured !== false) {
        if (!labels.includes(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT)) {
          labels.push(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT);
        }
        if (outcome === OUTCOME.SOFTNAV_TX_ONLY && !reset.traceResetAfterSoftPush) {
          outcome = OUTCOME.SOFTNAV_TX_WITHOUT_PIN;
        }
      }
    }
  } else if (pinInfo.activePin?.txId || pinInfo.events.some(eventTxId)) {
    transactionId = pinInfo.activePin?.txId ?? eventTxId(pinInfo.events.find(eventTxId));
    if (mainPhases.length === 0 && !archivePhases.hasBegin) {
      outcome = OUTCOME.PIN_TX_WITHOUT_MAIN_TRACE;
      evaluationStatus = "PIN_TX_WITHOUT_MAIN_TRACE";
    } else {
      outcome = OUTCOME.FULL_TX_RESOLVED;
      evaluationStatus = "FULL_TX_RESOLVED";
      cleanEligible = combinedPhases.hasArmed && combinedPhases.hasSliding && combinedPhases.hasTe;
    }
  } else if (archiveTxIds.length > 0 && !archiveInfo.expired) {
    transactionId = archiveTxIds[archiveTxIds.length - 1];
    const ap = mainTraceHasTxPhases(archiveInfo.events, transactionId);
    if (ap.hasBegin && ap.hasArmed) {
      outcome = OUTCOME.FULL_TX_RESOLVED;
      evaluationStatus = "FULL_TX_RESOLVED_FROM_ARCHIVE";
      cleanEligible = ap.hasArmed && ap.hasSliding && ap.hasTe;
    } else {
      outcome = OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET;
      evaluationStatus = "MAIN_TRACE_RESET_AFTER_SOFT_PUSH";
    }
  } else if (archiveInfo.expired) {
    outcome = OUTCOME.TRACE_ARCHIVE_EXPIRED;
    evaluationStatus = "TRACE_ARCHIVE_EXPIRED";
  } else if (mainPhases.hasBegin) {
    const begin = main.find((e) => eventKind(e) === "TRANSITION_BEGIN");
    transactionId = eventTxId(begin);
    outcome = OUTCOME.FULL_TX_RESOLVED;
    evaluationStatus = "FULL_TX_RESOLVED";
    cleanEligible = mainPhases.hasArmed && mainPhases.hasSliding && mainPhases.hasTe;
  } else {
    outcome = OUTCOME.NO_TX_CANDIDATE;
    evaluationStatus = "NO_TX_CANDIDATE";
  }

  // Soft-nav-only can never be CLEAN.
  if (
    outcome === OUTCOME.SOFTNAV_TX_ONLY ||
    outcome === OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET ||
    outcome === OUTCOME.SOFTNAV_TX_WITHOUT_PIN ||
    outcome === OUTCOME.PIN_TX_WITHOUT_MAIN_TRACE ||
    outcome === OUTCOME.TRACE_ARCHIVE_EXPIRED
  ) {
    cleanEligible = false;
  } else if (outcome === OUTCOME.FULL_TX_RESOLVED) {
    cleanEligible =
      combinedPhases.hasArmed && combinedPhases.hasSliding && combinedPhases.hasTe;
  } else {
    cleanEligible = false;
  }

  const softNavPresent = Boolean(soft?.txId);
  const collapsedToNoTx =
    softNavPresent &&
    (outcome === OUTCOME.NO_TX_CANDIDATE || evaluationStatus === "NO_TX_CANDIDATE");

  return {
    outcome,
    evaluationStatus,
    transactionId,
    labels: [...new Set(labels)],
    cleanEligible,
    currentHopSoftNavTxId: soft?.txId ?? null,
    currentHopSoftNavPhase: soft?.phase ?? null,
    currentHopSoftNavActiveTx: soft?.activeTx ?? false,
    currentHopSoftNavTxCount: soft?.txId ? 1 : 0,
    currentHopMainTraceTxCount: mainPhases.hasBegin ? 1 : 0,
    currentHopMainTraceLength: main.length,
    currentHopArchivedTraceLength: archiveInfo.events.length,
    currentHopPinEventCount: pinInfo.events.length,
    traceResetAfterSoftPush: reset.traceResetAfterSoftPush,
    runtimeCreatedAfterSoftPush: reset.runtimeCreatedAfterSoftPush,
    legacyRevealAfterReset: reset.legacyRevealAfterReset,
    postSoftPushRuntimeReinitOrRealmWipe: reset.postSoftPushRuntimeReinitOrRealmWipe,
    mergedTrace: merge.merged,
    mergeInvariants: merge.invariants,
    invariants: {
      SOFTNAV_TX_NEVER_COLLAPSES_TO_NO_TX: !collapsedToNoTx,
      MAIN_TRACE_EMPTY_WITH_SOFTNAV_TX_FORBIDDEN_AS_GENERIC_NO_TX: !collapsedToNoTx,
      NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY:
        merge.invariants.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY,
      PIN_DIAG_CAPTURED_WHEN_EXPORT_AVAILABLE:
        pinDiagCaptured !== false || pinInfo.exportMissing,
      TRACE_RESET_AFTER_SOFT_PUSH_EXPLICITLY_CLASSIFIED:
        !reset.traceResetAfterSoftPush ||
        labels.includes(LABEL.MAIN_TRACE_RING_RESET_AFTER_SOFT_PUSH) ||
        labels.includes(LABEL.SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET),
      SOFTNAV_TX_WITHOUT_PIN_EXPLICITLY_CLASSIFIED:
        !softNavPresent ||
        pinForSoft ||
        pinDiagCaptured === false ||
        labels.includes(LABEL.SOFTNAV_TX_WITHOUT_PIN_EVENT),
      NO_FAKE_CLEAN_WITH_SOFTNAV_ONLY:
        !(
          cleanEligible &&
          (outcome === OUTCOME.SOFTNAV_TX_ONLY ||
            outcome === OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET ||
            outcome === OUTCOME.SOFTNAV_TX_WITHOUT_PIN)
        ),
    },
    reason:
      softNavPresent && main.length === 0
        ? "SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET"
        : outcome === OUTCOME.NO_TX_CANDIDATE
          ? "NO_CURRENT_HOP_TX_CANDIDATE"
          : outcome,
  };
}

/**
 * Reclassify offline prod artifact that had soft-nav tx but empty main hop trace.
 */
export function reclassifyProdSoftNavEmptyMainTrace(artifact = {}) {
  const softNavDiag =
    artifact.softNavDiag ??
    artifact.hopNineDiag?.softNavDiag ??
    artifact.hopReport?.hopNineDiag?.softNavDiag ??
    [];
  const mainTraceCurrent =
    artifact.hopTraceForHop ??
    artifact.hopNineEvidence?.hopTrace ??
    artifact.mainTabToShuffleTraceFiltered ??
    [];
  const rawMain =
    artifact.mainTabToShuffleTrace ??
    artifact.hopReport?.mainTabToShuffleTrace ??
    [];
  const pinDiag = artifact.pinDiag ?? artifact.txPinDiag ?? null;
  const runtimeLifecycle = asArray(rawMain).filter((e) =>
    ["TRACE_RING_CREATED", "PRESENTATION_RUNTIME_CREATED", "LEGACY_REVEAL_EXECUTED"].includes(
      eventKind(e),
    ),
  );

  const resolved = resolveSoftNavAwareCurrentHop({
    mainTraceCurrent: asArray(mainTraceCurrent).length ? mainTraceCurrent : [],
    softNavDiag,
    pinDiag: pinDiag ?? "MISSING",
    pinDiagCaptured: pinDiag != null,
    runtimeLifecycle:
      runtimeLifecycle.length > 0
        ? runtimeLifecycle
        : asArray(rawMain),
    traceArchive: artifact.traceArchive ?? null,
    captureStartMono: artifact.captureStartMono ?? 0,
  });

  const classification =
    resolved.currentHopSoftNavTxId &&
    (resolved.outcome === OUTCOME.SOFTNAV_TX_WITH_TRACE_RESET ||
      resolved.outcome === OUTCOME.SOFTNAV_TX_ONLY ||
      resolved.outcome === OUTCOME.SOFTNAV_TX_WITHOUT_PIN)
      ? "PROD_SOFTNAV_TX_CREATED_BUT_MAIN_TRACE_RESET_ROLLED_BACK_FALSE"
      : resolved.outcome;

  return {
    ...resolved,
    classification,
    originalClassificationPreserved: true,
    reprocessed: true,
  };
}
