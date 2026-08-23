function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

const STACK_KEY = "sayittome-native-nav-stack";
const MAX_STACK = 40;
const PERSIST_DEBOUNCE_MS = 300;

let memoryStack: string[] | null = null;
let persistTimer: number | null = null;

function readStackFromStorage(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(STACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => normalizePath(String(entry))).filter(Boolean);
  } catch {
    return [];
  }
}

function schedulePersistStack() {
  if (typeof window === "undefined" || !memoryStack) return;

  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
  }

  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    if (!memoryStack) return;
    window.sessionStorage.setItem(STACK_KEY, JSON.stringify(memoryStack));
  }, PERSIST_DEBOUNCE_MS);
}

function getStack(): string[] {
  if (memoryStack) return memoryStack;
  memoryStack = readStackFromStorage();
  return memoryStack;
}

function commitStack(next: string[]) {
  memoryStack = next;
  schedulePersistStack();
}

export function resetNativeNavStackForTests() {
  memoryStack = [];
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STACK_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function seedNativeNavStack(pathname: string) {
  const path = normalizePath(pathname);
  const stack = getStack();
  if (!stack.length) {
    commitStack([path]);
  }
}

export function recordNativeNavPath(pathname: string) {
  const path = normalizePath(pathname);
  const stack = [...getStack()];

  if (!stack.length) {
    commitStack([path]);
    return;
  }

  if (stack[stack.length - 1] === path) return;

  stack.push(path);
  if (stack.length > MAX_STACK) {
    stack.splice(0, stack.length - MAX_STACK);
  }

  commitStack(stack);
}

/** Returns the route before `currentPathname` without mutating the stack. */
export function peekNativeNavPath(currentPathname: string): string | null {
  const path = normalizePath(currentPathname);
  const stack = getStack();

  if (!stack.length) return null;

  let index = stack.length - 1;
  while (index >= 0 && stack[index] === path) {
    index -= 1;
  }

  return index >= 0 ? stack[index] : null;
}

/** Returns the previous in-app route and updates the stack. */
export function popNativeNavPath(currentPathname: string): string | null {
  const path = normalizePath(currentPathname);
  const stack = [...getStack()];

  if (!stack.length) return null;

  while (stack.length > 0 && stack[stack.length - 1] === path) {
    stack.pop();
  }

  const previous = stack[stack.length - 1] || null;
  commitStack(stack);
  return previous;
}
