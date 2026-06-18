export const PLAY_STORE_PACKAGE = "com.sayittome.app";

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;

export function openPlayStore() {
  if (typeof window === "undefined") return;
  window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer");
}
