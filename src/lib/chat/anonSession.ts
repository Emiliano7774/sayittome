export function getAnonSessionId() {
  if (typeof window === "undefined") {
    return "anon_server";
  }

  const key = "sayittome_anon_session";

  let current =
    sessionStorage.getItem(key);

  if (!current) {
    current =
      "anon_" +
      Math.random()
        .toString(36)
        .slice(2) +
      "_" +
      Date.now().toString(36);

    sessionStorage.setItem(
      key,
      current,
    );
  }

  return current;
}

export function resetAnonSession() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(
    "sayittome_anon_session",
  );
}
