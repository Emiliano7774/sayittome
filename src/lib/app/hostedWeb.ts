/** Public Firebase Hosting URL for the independent web version. */
export const HOSTED_WEB_URL = "https://sayittome-app.web.app";

type HostedWebBridge = {
  SayItToMeHostedWeb?: { open: (url: string) => void };
};

/**
 * Open the hosted web app in the system browser.
 * On Android the Capacitor WebView will not leave sayittome-app.web.app via
 * window.open / allowNavigation, so the native bridge is required there.
 */
export function openHostedWeb() {
  if (typeof window === "undefined") return;

  const native = (window as Window & HostedWebBridge).SayItToMeHostedWeb;
  if (native?.open) {
    native.open(HOSTED_WEB_URL);
    return;
  }

  window.open(HOSTED_WEB_URL, "_blank", "noopener,noreferrer");
}
