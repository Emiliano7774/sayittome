const RETURN_KEY = "sayittome-profile-return";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function stashProfileReturnTo(pathname: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RETURN_KEY, normalizePath(pathname));
}

export function peekProfileReturnTo() {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(RETURN_KEY);
  return value ? normalizePath(value) : null;
}

export function consumeProfileReturnTo() {
  const value = peekProfileReturnTo();
  if (value && typeof window !== "undefined") {
    window.sessionStorage.removeItem(RETURN_KEY);
  }
  return value;
}
