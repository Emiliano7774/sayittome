/**
 * Injected into persistent capture browser — works without app deploy.
 * Exposes window.__authCaptureProbes
 */
(function authCaptureProbeInitScript() {
  const ring = [];
  const mutations = [];
  const loadingEvents = [];
  const loadingNodes = [];
  const pointers = [];
  const MAX_RING = 800;
  const MAX_MUT = 400;
  const MAX_LOADING_EVENTS = 200;
  const MAX_LOADING = 120;
  const MAX_PTR = 80;
  const RECT_TOL = 4;
  const MIN_FEED_H = Math.max(120, Math.round(window.innerHeight * 0.18));

  function monoMs() {
    return Math.round(performance.timeOrigin + performance.now());
  }

  function pushRing(kind, detail) {
    ring.push({ monoMs: monoMs(), kind, detail });
    if (ring.length > MAX_RING) ring.shift();
  }

  function pushMutation(target, type, value) {
    mutations.push({ monoMs: monoMs(), target, type, value });
    if (mutations.length > MAX_MUT) mutations.shift();
  }

  function pushLoadingEvent(event, detail) {
    loadingEvents.push({ monoMs: monoMs(), event, ...detail });
    if (loadingEvents.length > MAX_LOADING_EVENTS) loadingEvents.shift();
  }

  function rectSummary(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
      visibility: cs.visibility,
      opacity: cs.opacity,
      display: cs.display,
      zIndex: cs.zIndex,
      contain: cs.contain,
    };
  }

  function firstSlotSummary(host) {
    const prep = host?.querySelector(".sayittome-shuffle-surface-prep") ?? host;
    const list = prep?.querySelector("[data-shuffle-list]");
    const slot = list?.querySelector(":scope > *:not(.sayittome-nav-scroll-spacer)");
    if (!slot) return { key: "", rect: null };
    const r = slot.getBoundingClientRect();
    const key =
      slot.getAttribute("data-username") ||
      slot.getAttribute("data-profile-uid") ||
      slot.getAttribute("data-slot-index") ||
      "";
    return {
      key,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  }

  function isInViewport(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  function collectLoadingNodes(root) {
    const found = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent?.trim() ?? "";
      if (/Cargando\.\.\.|Loading\.\.\./i.test(text)) {
        const el = node.parentElement;
        if (el) {
          const shell = el.closest("[data-loading-shell]");
          const cs = getComputedStyle(el);
          found.push({
            monoMs: monoMs(),
            path: el.tagName.toLowerCase(),
            hasLoadingShellAncestor: Boolean(shell),
            text: text.slice(0, 40),
            rect: rectSummary(el),
            inViewport: isInViewport(el),
            computed: {
              display: cs.display,
              visibility: cs.visibility,
              opacity: cs.opacity,
            },
            ancestors: [
              shell ? "data-loading-shell" : null,
              el.closest("#sayittome-shuffle-keepalive-host") ? "shuffle-host" : null,
              el.closest("#sayittome-main-tab-keepalive-chats") ? "chats-host" : null,
            ].filter(Boolean),
          });
        }
      }
      node = walker.nextNode();
    }
    return found;
  }

  function loadingShellDetail(prep) {
    const shells = prep ? [...prep.querySelectorAll("[data-loading-shell]")] : [];
    return shells.map((shell) => ({
      rect: rectSummary(shell),
      text: shell.textContent?.trim().slice(0, 60),
      inViewport: isInViewport(shell),
      computed: (() => {
        const cs = getComputedStyle(shell);
        return {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          zIndex: cs.zIndex,
        };
      })(),
    }));
  }

  function sampleState() {
    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
    const prep = shuffleHost?.querySelector(".sayittome-shuffle-surface-prep") ?? shuffleHost;
    const feed = prep?.querySelector("[data-shuffle-list], [data-nav-shuffle-primary]");
    const feedRect = feed?.getBoundingClientRect();
    const scrollRoot = prep?.querySelector("main[data-scroll-root]");
    const domSlots =
      prep?.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)").length ?? 0;
    const prepDomSlots =
      shuffleHost?.querySelectorAll(
        ".sayittome-shuffle-surface-prep [data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)",
      ).length ?? domSlots;
    const slot = firstSlotSummary(shuffleHost);
    const loadingInPage = collectLoadingNodes(document.body);
    const shells = loadingShellDetail(prep);
    const prepCs = prep ? getComputedStyle(prep) : null;
    const shuffleHostCs = shuffleHost ? getComputedStyle(shuffleHost) : null;
    const postSettleRouteBridge = document.documentElement.hasAttribute("data-post-settle-route-bridge");
    const routeBridgeShuffleOwner =
      shuffleHost?.classList.contains("sayittome-route-bridge-shuffle-owner") ?? false;
    const shuffleHostRect = shuffleHost?.getBoundingClientRect();
    const bridgeOwnerSurfacePresentable =
      !postSettleRouteBridge ||
      (Boolean(shuffleHost) &&
        shuffleHostCs?.visibility === "visible" &&
        Number(shuffleHostCs?.opacity) > 0 &&
        Number(shuffleHostCs?.zIndex) >= 0 &&
        (shuffleHostRect?.width ?? 0) > 0 &&
        (shuffleHostRect?.height ?? 0) > 0 &&
        domSlots >= 3 &&
        shells.length === 0);

    for (const ln of loadingInPage) {
      loadingNodes.push(ln);
      if (loadingNodes.length > MAX_LOADING) loadingNodes.shift();
    }

    const navCapture = window.__sayittomeNavCapture?.state?.() ?? null;
    const handoffPending = document.documentElement.classList.contains("sayittome-shuffle-handoff-pending");
    const warmHints = readWarmHints();
    const classicModern = sampleClassicModernAudit();

    const base = {
      pathname: location.pathname,
      scrollY: Math.round(window.scrollY),
      presentedSurface: shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible")
        ? "shuffle"
        : chatsHost?.classList.contains("sayittome-main-tab-keepalive-visible")
          ? "chats"
          : "none",
      shuffleVisible: shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible") ?? false,
      shuffleFrozen: shuffleHost?.classList.contains("sayittome-shuffle-keepalive-frozen") ?? false,
      chatsVisible: chatsHost?.classList.contains("sayittome-main-tab-keepalive-visible") ?? false,
      chatsFrozen: chatsHost?.classList.contains("sayittome-main-tab-keepalive-frozen") ?? false,
      domSlots,
      prepDomSlots,
      paintedSlots: domSlots,
      firstSlotKey: slot.key,
      firstSlotRect: slot.rect,
      feedRect: feedRect ? { w: Math.round(feedRect.width), h: Math.round(feedRect.height) } : null,
      scrollTop: scrollRoot?.scrollTop ?? 0,
      loadingShell: shells.length > 0,
      loadingShellCount: shells.length,
      loadingShellDetail: shells,
      loadingTextCount: loadingInPage.length,
      loadingTextNodes: loadingInPage,
      htmlClasses: [...document.documentElement.classList].filter((c) => c.startsWith("sayittome-")),
      bodyClasses: [...document.body.classList].filter((c) => c.startsWith("sayittome-")),
      shuffleHost: rectSummary(shuffleHost),
      chatsHost: rectSummary(chatsHost),
      prepHost: prep
        ? {
            ...rectSummary(prep),
            hidden: prep.hasAttribute("hidden"),
            ariaHidden: prep.getAttribute("aria-hidden"),
            display: prepCs?.display,
            visibility: prepCs?.visibility,
            opacity: prepCs?.opacity,
          }
        : null,
      navCapture,
      handoffPending,
      revealDeferred: document.documentElement.classList.contains("sayittome-shuffle-reveal-deferred"),
      showShuffleLoading: shells.length > 0,
      showShuffleFeed: domSlots > 0 && !shells.length,
      warmHints,
      classicModern,
      legacyLoadingGate: window.__sayittomeLegacyLoadingGate?.exportCounters?.() ?? null,
      slideOwnerAttr: document.documentElement.getAttribute("data-main-tab-shuffle-owner"),
      postSettleRouteBridge,
      routeBridgeShuffleOwner,
      bridgeOwnerSurfacePresentable,
      shuffleHostVisibility: shuffleHostCs?.visibility ?? null,
      shuffleHostOpacity: shuffleHostCs ? Number(shuffleHostCs.opacity) : null,
      shuffleHostZIndex: shuffleHostCs ? Number(shuffleHostCs.zIndex) : null,
    };

    base.invariantAudit = computeInvariantAudit(base);
    return base;
  }

  function isStable(prev, next) {
    if (!prev || !next) return false;
    if (next.loadingShell || next.loadingTextCount > 0) return false;
    if (next.domSlots < 3) return false;
    if (!next.firstSlotRect || next.firstSlotRect.w < 24 || next.firstSlotRect.h < 24) return false;
    if (!next.feedRect || next.feedRect.h < MIN_FEED_H) return false;
    if (next.firstSlotKey !== prev.firstSlotKey) return false;
    if (next.scrollTop !== prev.scrollTop) return false;
    if (Math.abs((prev.feedRect?.h ?? 0) - (next.feedRect?.h ?? 0)) > RECT_TOL) return false;
    const a = prev.firstSlotRect;
    const b = next.firstSlotRect;
    if (!a || !b) return false;
    return (
      Math.abs(a.x - b.x) <= RECT_TOL &&
      Math.abs(a.y - b.y) <= RECT_TOL &&
      Math.abs(a.w - b.w) <= RECT_TOL &&
      Math.abs(a.h - b.h) <= RECT_TOL
    );
  }

  let lastSample = null;
  let stableStreak = 0;

  function observeStability() {
    const next = sampleState();
    if (isStable(lastSample, next)) stableStreak += 1;
    else stableStreak = 0;
    lastSample = next;
    return { stableStreak, sample: next };
  }

  function nearest(monoTarget) {
    let before = null;
    let after = null;
    for (const item of ring) {
      if (item.monoMs <= monoTarget) before = item;
      if (item.monoMs >= monoTarget && !after) after = item;
    }
    return {
      before,
      after,
      beforeDeltaMs: before ? monoTarget - before.monoMs : null,
      afterDeltaMs: after ? after.monoMs - monoTarget : null,
    };
  }

  function nearestLoadingEvent(monoTarget) {
    let before = null;
    let after = null;
    for (const item of loadingEvents) {
      if (item.monoMs <= monoTarget) before = item;
      if (item.monoMs >= monoTarget && !after) after = item;
    }
    return {
      before,
      after,
      beforeDeltaMs: before ? monoTarget - before.monoMs : null,
      afterDeltaMs: after ? after.monoMs - monoTarget : null,
    };
  }

  function inferPresentationSignature(prep) {
    if (!prep) return "EMPTY";
    const shells = prep.querySelectorAll("[data-loading-shell]").length;
    const slots =
      prep.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)").length ?? 0;
    if (shells > 0) return "LOADING";
    if (slots >= 3) return "FEED";
    if (slots > 0) return "PARTIAL_FEED";
    return "EMPTY";
  }

  function sampleTreeForMode(prep, mode) {
    const root =
      mode === "modern"
        ? prep?.querySelector(".grid.grid-cols-2")?.closest("main") ?? prep
        : prep?.querySelector("[data-shuffle-list]")?.closest("main") ?? prep;
    const scope = root ?? prep;
    const shells = scope ? [...scope.querySelectorAll("[data-loading-shell]")] : [];
    const domSlots =
      scope?.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)").length ?? 0;
    const loadingTexts = scope ? collectLoadingNodes(scope) : [];
    const visibleShells = shells.filter((s) => isInViewport(s));
    return {
      mode,
      mounted: Boolean(scope && scope !== document.body),
      loadingShellCount: shells.length,
      visibleLoadingShellCount: visibleShells.length,
      domSlots,
      presentationSignature: inferPresentationSignature(scope ?? prep),
      loadingTextNodes: loadingTexts.filter((n) => n.inViewport),
      feedRect: (() => {
        const feed = scope?.querySelector("[data-shuffle-list], [data-nav-shuffle-primary]");
        return feed ? rectSummary(feed) : null;
      })(),
    };
  }

  function sampleClassicModernAudit() {
    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const prep = shuffleHost?.querySelector(".sayittome-shuffle-surface-prep") ?? shuffleHost;
    const modernMarker = Boolean(prep?.querySelector(".grid.grid-cols-2"));
    const classicMarker = Boolean(prep?.querySelector("[data-shuffle-list]:not(.grid)"));
    const activeMode = modernMarker ? "modern" : classicMarker ? "classic" : "unknown";
    return {
      activeMode,
      classic: sampleTreeForMode(prep, "classic"),
      modern: sampleTreeForMode(prep, "modern"),
    };
  }

  function readWarmHints() {
    let hasHydrated = false;
    try {
      hasHydrated = localStorage.getItem("sayittome_shuffle_hydrated") === "1";
    } catch {
      hasHydrated = false;
    }
    const handoffPreparing = document.documentElement.classList.contains("sayittome-shuffle-handoff-preparing");
    const revealDeferred = document.documentElement.classList.contains("sayittome-shuffle-reveal-deferred");
    const handoffPending = document.documentElement.classList.contains("sayittome-shuffle-handoff-pending");
    const hostMounted = Boolean(document.getElementById("sayittome-shuffle-keepalive-host"));
    const keepAliveActive = Boolean(
      document
        .getElementById("sayittome-shuffle-keepalive-host")
        ?.classList.contains("sayittome-shuffle-keepalive-visible"),
    );
    return {
      hasShuffleEverHydrated: hasHydrated,
      isShuffleRevealDeferred: revealDeferred,
      isShuffleHandoffPreparing: handoffPreparing,
      handoffPending,
      hostMounted,
      keepAliveActive,
      validWarmHandoff: handoffPending && keepAliveActive && !revealDeferred,
    };
  }

  function computeInvariantAudit(detail) {
    const warm =
      (detail?.domSlots ?? 0) >= 3 ||
      (detail?.prepDomSlots ?? 0) >= 3 ||
      detail?.warmHints?.hasShuffleEverHydrated ||
      detail?.warmHints?.keepAliveActive;
    const showShuffleLoading = Boolean(detail?.loadingShell || (detail?.loadingShellCount ?? 0) > 0);
    const showShuffleFeed = (detail?.domSlots ?? 0) > 0 && !showShuffleLoading;
    return {
      warm,
      showShuffleLoading,
      showShuffleFeed,
      invariantA_warmNeverShowLoading: !warm || !showShuffleLoading,
      invariantB_warmRevealLoadingShellZero: !warm || (detail?.loadingShellCount ?? 0) === 0,
      invariantC_warmRevealSlotsGte3: !warm || (detail?.domSlots ?? 0) >= 3 || (detail?.prepDomSlots ?? 0) >= 3,
      invariantD_singleFeedReveal: null,
    };
  }

  function exportRevealAudit() {
    const nav = window.__sayittomeNavCapture?.export?.() ?? null;
    return {
      navCaptureEnabled: Boolean(window.__sayittomeNavCapture),
      navEvents: nav?.events ?? null,
      renderSignatures: window.__sayittomeShuffleRenderSignatures?.export?.() ?? null,
    };
  }

  function hostOwnershipState() {
    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
    const prep = shuffleHost?.querySelector(".sayittome-shuffle-surface-prep") ?? shuffleHost;
    const cs = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        visibility: s.visibility,
        opacity: s.opacity,
        zIndex: s.zIndex,
        transform: s.transform,
        contain: s.contain,
        contentVisibility: s.contentVisibility,
        willChange: s.willChange,
        display: s.display,
        classes: [...el.classList],
        rect: rectSummary(el),
        hasLoadingShell: Boolean(prep?.querySelector("[data-loading-shell]")),
        hasFeed: Boolean(prep?.querySelector("[data-shuffle-list] > *")),
      };
    };
    return {
      html: cs(document.documentElement),
      body: cs(document.body),
      shuffleHost: cs(shuffleHost),
      chatsHost: cs(chatsHost),
      prep: cs(prep),
      classicModern: sampleClassicModernAudit(),
    };
  }

  function watchClass(el, label) {
    if (!el) return;
    const obs = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === "attributes" && rec.attributeName === "class") {
          pushMutation(label, "class", [...el.classList].join(" "));
        }
      }
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  }

  watchClass(document.documentElement, "html");
  watchClass(document.body, "body");
  const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
  watchClass(shuffleHost, "shuffle-host");
  watchClass(document.getElementById("sayittome-main-tab-keepalive-chats"), "chats-host");

  function observeLoadingShellTree() {
    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    if (!shuffleHost) return;

    const noteAncestorVisibility = (el, reason) => {
      let node = el;
      while (node && node !== document.body) {
        if (node.nodeType === 1) {
          const cs = getComputedStyle(node);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) {
            pushLoadingEvent("LOADING_ANCESTOR_VISIBILITY_CHANGED", {
              target: node.id || node.className?.toString?.().slice(0, 60) || node.tagName,
              reason,
              display: cs.display,
              visibility: cs.visibility,
              opacity: cs.opacity,
            });
            break;
          }
        }
        node = node.parentElement;
      }
    };

    const scanShell = (root, action) => {
      if (!root || root.nodeType !== 1) return;
      if (root.matches?.("[data-loading-shell]")) {
        pushLoadingEvent(action, { target: "data-loading-shell", text: root.textContent?.trim().slice(0, 40) });
      }
      root.querySelectorAll?.("[data-loading-shell]")?.forEach((shell) => {
        pushLoadingEvent(action, { target: "data-loading-shell", text: shell.textContent?.trim().slice(0, 40) });
      });
    };

    const obs = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type === "childList") {
          rec.addedNodes.forEach((node) => {
            scanShell(node, "LOADING_NODE_ADDED");
          });
          rec.removedNodes.forEach((node) => {
            scanShell(node, "LOADING_NODE_REMOVED");
          });
        }
        if (rec.type === "attributes") {
          const el = rec.target;
          if (el?.matches?.("[data-loading-shell]") || el?.closest?.("[data-loading-shell]")) {
            pushLoadingEvent("LOADING_NODE_STYLE_CHANGED", {
              target: "data-loading-shell",
              attr: rec.attributeName,
              value: el.getAttribute?.(rec.attributeName),
            });
            noteAncestorVisibility(el, `attr:${rec.attributeName}`);
          }
          if (["class", "style", "hidden", "aria-hidden"].includes(rec.attributeName)) {
            const shell = el?.querySelector?.("[data-loading-shell]") || (el?.matches?.("[data-loading-shell]") ? el : null);
            if (shell) noteAncestorVisibility(shell, `ancestor-attr:${rec.attributeName}`);
          }
        }
        if (rec.type === "characterData") {
          const text = rec.target?.textContent?.trim() ?? "";
          if (/Cargando\.\.\.|Loading\.\.\./i.test(text)) {
            pushLoadingEvent("LOADING_NODE_STYLE_CHANGED", {
              target: "text-node",
              text: text.slice(0, 40),
            });
          }
        }
      }
    });

    obs.observe(shuffleHost, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
      characterData: true,
    });
  }

  observeLoadingShellTree();

  const rafLoop = () => {
    pushRing("raf", sampleState());
    requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);

  ["pointerdown", "pointerup", "click", "touchstart", "touchend"].forEach((type) => {
    window.addEventListener(
      type,
      (event) => {
        const tab = event.target?.closest?.("[data-nav-tab]")?.getAttribute("data-nav-tab");
        const shuffle = tab === "shuffle";
        const entry = {
          monoMs: monoMs(),
          type,
          tab: tab ?? null,
          isTrusted: event.isTrusted,
          pointerType: event.pointerType ?? null,
        };
        pointers.push(entry);
        if (pointers.length > MAX_PTR) pointers.shift();
        pushRing(type, tab ? `tab:${tab}` : undefined);
        if (shuffle) {
          const navKind =
            type === "pointerdown"
              ? "NAV_INPUT_POINTERDOWN"
              : type === "pointerup"
                ? "NAV_INPUT_POINTERUP"
                : type === "click"
                  ? "NAV_INPUT_CLICK"
                  : type === "touchstart"
                    ? "NAV_INPUT_TOUCHSTART"
                    : type === "touchend"
                      ? "NAV_INPUT_TOUCHEND"
                      : `NAV_INPUT_${type.toUpperCase()}`;
          pushRing(navKind, `tab:shuffle|trusted=${event.isTrusted}|ptr=${event.pointerType ?? "n/a"}`);
        }
      },
      true,
    );
  });

  window.__authCaptureProbes = {
    monoMs,
    sampleState,
    observeStability,
    nearest,
    exportAll() {
      return {
        ring: [...ring],
        mutations: [...mutations],
        loadingEvents: [...loadingEvents],
        loadingNodes: [...loadingNodes],
        pointers: [...pointers],
        mainTabToShuffleTrace:
          typeof window.__mainTabToShuffleTraceExport === "function"
            ? window.__mainTabToShuffleTraceExport()
            : null,
        hopNineDiag:
          typeof window.__hopNineDiag?.exportAll === "function"
            ? window.__hopNineDiag.exportAll()
            : null,
        stableStreak,
        lastSample,
      };
    },
    nearestLoadingEvent,
    hostOwnershipState,
    exportRevealAudit,
    resetStability() {
      lastSample = null;
      stableStreak = 0;
    },
  };
})();
