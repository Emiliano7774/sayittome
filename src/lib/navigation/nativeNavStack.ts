function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

const STACK_KEY = "sayittome-native-nav-stack";
const MAX_STACK = 40;

function readStack(): string[] {
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

function writeStack(stack: string[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
}

export function seedNativeNavStack(pathname: string) {
  const path = normalizePath(pathname);
  const stack = readStack();
  if (!stack.length) {
    writeStack([path]);
  }
}

export function recordNativeNavPath(pathname: string) {
  const path = normalizePath(pathname);
  const stack = readStack();

  if (!stack.length) {
    writeStack([path]);
    return;
  }

  if (stack[stack.length - 1] === path) return;

  stack.push(path);
  if (stack.length > MAX_STACK) {
    stack.splice(0, stack.length - MAX_STACK);
  }

  writeStack(stack);
}

/** Returns the previous in-app route and updates the stack. */
export function popNativeNavPath(currentPathname: string): string | null {
  const path = normalizePath(currentPathname);
  const stack = readStack();

  if (!stack.length) return null;

  while (stack.length > 0 && stack[stack.length - 1] === path) {
    stack.pop();
  }

  const previous = stack[stack.length - 1] || null;
  writeStack(stack);
  return previous;
}
