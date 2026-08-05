/**
 * Proves the hooks-order crash exists for the buggy pattern and is absent for the fixed one.
 * Runs inside Chromium with React 19 from esm.sh (no app server required).
 *
 * Usage: node scripts/modern-anon-hooks-crash-repro.harness.mjs
 */
import { chromium } from "playwright";

const html = `<!doctype html><html><body><div id="root"></div></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async () => {
  const React = await import("https://esm.sh/react@19.2.4");
  const { createRoot } = await import("https://esm.sh/react-dom@19.2.4/client");
  const { Component, useCallback, useEffect, useState } = React;

  function useOverlayBackClose(open, onClose) {
    useEffect(() => {
      if (!open) return;
      const handler = () => onClose();
      window.addEventListener("x-close", handler);
      return () => window.removeEventListener("x-close", handler);
    }, [open, onClose]);
  }

  class Catcher extends Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    render() {
      if (this.state.error) {
        return React.createElement(
          "pre",
          { "data-caught": "1" },
          String(this.state.error?.message || this.state.error),
        );
      }
      return this.props.children;
    }
  }

  function Buggy({ loading, ready }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {}, []);
    if (loading || !ready) return null;
    const close = useCallback(() => setOpen(false), []);
    useOverlayBackClose(open, close);
    return React.createElement("div", { "data-card": "buggy" }, "ok");
  }

  function Fixed({ loading, ready }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {}, []);
    const close = useCallback(() => setOpen(false), []);
    useOverlayBackClose(open, close);
    if (loading || !ready) return null;
    return React.createElement("div", { "data-card": "fixed" }, "ok");
  }

  function run(Component) {
    return new Promise((resolve) => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      let setProps;
      let caught = null;
      const root = createRoot(host, {
        onUncaughtError(error) {
          caught = String(error?.message || error);
        },
        onCaughtError(error) {
          caught = String(error?.message || error);
        },
        onRecoverableError(error) {
          caught = String(error?.message || error);
        },
      });
      function App() {
        const [props, set] = useState({ loading: true, ready: false });
        setProps = set;
        return React.createElement(
          Catcher,
          null,
          React.createElement(Component, props),
        );
      }
      root.render(React.createElement(App));
      setTimeout(() => {
        setProps({ loading: false, ready: true });
        setTimeout(() => {
          const boundaryText =
            host.querySelector("[data-caught='1']")?.textContent || null;
          const final = caught || boundaryText;
          try {
            root.unmount();
          } catch {
            /* ignore */
          }
          resolve(final);
        }, 80);
      }, 40);
    });
  }

  const buggyError = await run(Buggy);
  const fixedError = await run(Fixed);
  return {
    buggyError: buggyError ? String(buggyError).slice(0, 320) : null,
    fixedError: fixedError ? String(fixedError).slice(0, 320) : null,
    buggyCrashes: Boolean(buggyError),
    fixedSurvives: !fixedError,
  };
});

const report = {
  gate: "MODERN_ANON_HOOKS_CRASH_REPRO",
  ...result,
  pass: result.buggyCrashes && result.fixedSurvives,
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!report.pass) process.exitCode = 1;
