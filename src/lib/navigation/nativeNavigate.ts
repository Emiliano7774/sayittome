export function runNativeViewTransition(task: () => void) {
  if (typeof document === "undefined") {
    task();
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & {
    startViewTransition?: (updateCallback: () => void) => { finished: Promise<void> };
  };

  if (!prefersReducedMotion && typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      task();
    });
    return;
  }

  task();
}
