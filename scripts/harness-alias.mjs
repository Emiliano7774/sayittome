import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function installHarnessAlias(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  function resolveExisting(abs) {
    const candidates = [abs, `${abs}.ts`, `${abs}.tsx`, `${abs}.js`, path.join(abs, "index.ts")];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return pathToFileURL(candidate).href;
      }
    }
    return "";
  }

  function resolveAlias(specifier, parentURL = "") {
    if (specifier === "server-only") {
      return pathToFileURL(path.join(root, "scripts/harness-server-only-stub.mjs")).href;
    }
    if (specifier.startsWith("@/")) {
      return resolveExisting(path.join(root, "src", specifier.slice(2)));
    }
    if (specifier.startsWith(".") && parentURL) {
      try {
        const parentPath = fileURLToPath(parentURL);
        if (!parentPath.replace(/\\/g, "/").includes("/src/")) return "";
        const parentDir = path.dirname(parentPath);
        return resolveExisting(path.join(parentDir, specifier));
      } catch {
        return "";
      }
    }
    return "";
  }

  if (typeof module.registerHooks === "function") {
    module.registerHooks({
      resolve(specifier, context, nextResolve) {
        const mapped = resolveAlias(specifier, context.parentURL);
        if (mapped) return { url: mapped, shortCircuit: true };
        return nextResolve(specifier, context);
      },
    });
  }

  return root;
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
  };
}

export function installHarnessWindow() {
  // session and local must be distinct so durable-ticket tests can simulate WebView restart.
  if (
    typeof globalThis.window !== "undefined" &&
    globalThis.sessionStorage &&
    globalThis.localStorage &&
    globalThis.sessionStorage !== globalThis.localStorage
  ) {
    return;
  }
  const sessionStorage = createMemoryStorage();
  const localStorage = createMemoryStorage();
  globalThis.sessionStorage = sessionStorage;
  globalThis.localStorage = localStorage;
  const windowShim = {
    sessionStorage,
    localStorage,
    scrollTo() {},
    scrollY: 0,
    location: {
      href: "http://localhost/",
      pathname: "/",
      search: "",
      hash: "",
      assign() {},
      replace() {},
    },
    dispatchEvent() {
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame(cb) {
      return setTimeout(cb, 0);
    },
    cancelAnimationFrame(id) {
      clearTimeout(id);
    },
  };
  globalThis.window = Object.assign(globalThis, windowShim);
  if (typeof globalThis.Event !== "function") {
    globalThis.Event = class Event {
      constructor(type) {
        this.type = type;
      }
    };
  }
  globalThis.document = {
    querySelector: () => null,
    getElementById: () => null,
    visibilityState: "visible",
    documentElement: { classList: { contains: () => false, add() {}, remove() {} }, dataset: {} },
    body: { classList: { contains: () => false, add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {},
  };
}
