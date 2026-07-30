"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import {
  forcePresentShuffleSurfaceForNonMainReveal,
  isShuffleRevealDeferred,
} from "@/lib/navigation/shuffleHandoffState";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";
import { hasShuffleEverHydrated } from "@/hooks/useShuffleReady";
import {
  hasDurableRestorableWarmShuffle,
  isShuffleDestinationWarmIntentActive,
} from "@/lib/shuffle/shuffleWarmHopIntent";
import { countRestorableWarmFeedSlots } from "@/lib/shuffle/shufflePresentation";

function elementIsVisible(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.hasAttribute("inert")) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity || "1") < 0.05) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 8 && rect.height > 8;
}

function hasPrimaryShuffleContent(host: HTMLElement | null) {
  if (!host || !elementIsVisible(host)) return false;
  const candidates = host.querySelectorAll(
    [
      "[data-shuffle-list] > *",
      "[data-shuffle-list]",
      "[data-shuffle-slot]",
      "[data-shuffle-search='1']",
      "[data-nav-shuffle-primary]",
      "button",
      "input",
      "[role='button']",
      "a[href]",
      "img",
    ].join(","),
  );
  return [...candidates].some(elementIsVisible);
}

function hasHumanShuffleContent(host: HTMLElement | null) {
  if (!host || !elementIsVisible(host)) return false;
  return (
    hasPrimaryShuffleContent(host) ||
    elementIsVisible(host.querySelector("[data-shuffle-emergency-shell='1']")) ||
    elementIsVisible(host.querySelector("[data-shuffle-error-shell='1']"))
  );
}

export function ShuffleEmergencyShell({
  error = false,
  global = false,
}: {
  error?: boolean;
  global?: boolean;
}) {
  useEffect(() => {
    if (!error && !global) return;
    recordQaCriticalEvent(
      "nav",
      error ? "RUNTIME_ERROR" : "SHUFFLE_SHELL_VISIBLE",
      { global },
    );
  }, [error, global]);

  return (
    <section
      data-shuffle-emergency-shell={error ? undefined : "1"}
      data-shuffle-error-shell={error ? "1" : undefined}
      data-shuffle-global-safety={global ? "1" : undefined}
      aria-label={error ? "Shuffle recovery" : "Shuffle"}
      className="fixed inset-0 flex min-h-[100dvh] flex-col bg-[#0b0b0b] px-5 pb-28 pt-[max(28px,env(safe-area-inset-top))] text-white"
      style={{ zIndex: global ? 8 : 0 }}
    >
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Shuffle</h1>
        <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-200">
          {error ? "Recuperación" : "Cargando"}
        </span>
      </header>
      <div className="mx-auto mt-8 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((slot) => (
          <div
            key={slot}
            className="h-36 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-violet-500/[0.06]"
          />
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-md text-center text-sm font-semibold text-white/55">
        {error
          ? "Shuffle tuvo un problema, pero la pantalla se recuperó. Podés volver a intentarlo."
          : "Preparando perfiles…"}
      </p>
    </section>
  );
}

type BoundaryState = { failed: boolean };

export class ShuffleSurfaceErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordQaCriticalEvent("runtime", "RUNTIME_ERROR", {
      message: error.message,
      stack: info.componentStack || "",
      surface: "shuffle",
    });
  }

  render() {
    if (this.state.failed) return <ShuffleEmergencyShell error />;
    return this.props.children;
  }
}

/** Global route-level fallback: survives a missing/unmounted keepalive host. */
export function ShuffleGlobalSafetyNet() {
  const pathname = usePathname();
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const readyLoggedRef = useRef(false);
  const path = pathname.split("?")[0].split("#")[0];

  useEffect(() => {
    if (path !== "/shuffle") {
      setRecoveryVisible(false);
      readyLoggedRef.current = false;
      return;
    }

    const html = document.documentElement;
    html.setAttribute("data-sayittome-route-kind", "shuffle");
    document.body.classList.add(
      "sayittome-shuffle-route",
      "sayittome-shuffle-surface-active",
    );
    recordQaCriticalEvent("nav", "ROUTE_COMMIT", { pathname: path });
    recordQaCriticalEvent("nav", "ACTIVE_PANEL_SET", { panel: "shuffle" });

    const inspect = () => {
      const host = document.getElementById(
        "sayittome-shuffle-keepalive-host",
      ) as HTMLElement | null;
      // If the keep-alive host is mounted but currently frozen/opacity-hidden
      // during a warm handoff, do not treat that as a blank requiring the
      // global loading shell — that is the Chats→Shuffle flicker.
      if (
        host &&
        (isShuffleDestinationWarmIntentActive() ||
          isShuffleRevealDeferred() ||
          hasDurableRestorableWarmShuffle() ||
          hasShuffleEverHydrated() ||
          countRestorableWarmFeedSlots() >= 3)
      ) {
        setRecoveryVisible(false);
        return true;
      }
      if (hasHumanShuffleContent(host)) {
        setRecoveryVisible(false);
        if (hasPrimaryShuffleContent(host) && !readyLoggedRef.current) {
          readyLoggedRef.current = true;
          recordQaCriticalEvent("nav", "SHUFFLE_CONTENT_READY", {
            hostMounted: true,
          });
        }
        return true;
      }
      return false;
    };

    let recoveryTriggered = false;
    const recoverBlank = () => {
      if (recoveryTriggered || inspect()) return;

      // Warm Chats→Shuffle / tab hops already have keep-alive or cache. Flashing
      // the global "Preparando perfiles…" shell is the visible pestañeo.
      const warmHop =
        isShuffleDestinationWarmIntentActive() ||
        isShuffleRevealDeferred() ||
        hasDurableRestorableWarmShuffle() ||
        hasShuffleEverHydrated() ||
        countRestorableWarmFeedSlots() >= 3;
      if (warmHop) {
        forcePresentShuffleSurfaceForNonMainReveal();
        setRecoveryVisible(false);
        recordQaCriticalEvent("nav", "SHUFFLE_WARM_SAFETY_SKIP_LOADING_SHELL", {
          hostMounted: Boolean(
            document.getElementById("sayittome-shuffle-keepalive-host"),
          ),
        });
        return;
      }

      recoveryTriggered = true;
      forcePresentShuffleSurfaceForNonMainReveal();
      const host = document.getElementById(
        "sayittome-shuffle-keepalive-host",
      ) as HTMLElement | null;
      if (host) {
        host.classList.remove("sayittome-shuffle-keepalive-frozen");
        host.classList.add("sayittome-shuffle-keepalive-visible");
        host.removeAttribute("inert");
        host.setAttribute("aria-hidden", "false");
      }
      setRecoveryVisible(true);
      recordQaCriticalEvent("nav", "BLACK_RECOVERY_TRIGGERED", {
        hostMounted: Boolean(host),
        afterMs: 300,
      });
    };
    const recoveryEligibleAt = Date.now() + 300;
    const timer = window.setTimeout(recoverBlank, 300);

    const observer = new MutationObserver(() => {
      if (inspect()) {
        recoveryTriggered = false;
        return;
      }
      if (Date.now() >= recoveryEligibleAt) recoverBlank();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-hidden", "style"],
    });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [path]);

  if (path !== "/shuffle" || !recoveryVisible) return null;
  return <ShuffleEmergencyShell global />;
}
