const SHELL_ID = "sayittome-chat-open-shell";

let shellChatId = "";
let watchTimer = 0;
let watchFrame = 0;
let watchObserver: MutationObserver | null = null;

function chatIdFromHref(href: string) {
  const path = href.split("?")[0].split("#")[0];
  const raw = path.split("/chat/")[1] || "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function dismissPresentedChatThread() {
  shellChatId = "";
  if (watchTimer) {
    window.clearInterval(watchTimer);
    watchTimer = 0;
  }
  if (watchFrame) {
    window.cancelAnimationFrame(watchFrame);
    watchFrame = 0;
  }
  watchObserver?.disconnect();
  watchObserver = null;
  document.getElementById(SHELL_ID)?.remove();
  document.documentElement.removeAttribute("data-sayittome-chat-open");
}

function realThreadIsReady() {
  if (document.querySelector("[data-chat-bubbles-settled='1']")) return true;
  return Boolean(
    document.querySelector(".sayittome-chat-shell") &&
      !document.querySelector("[data-chat-thread-header]"),
  );
}

function watchForRealThread(chatId: string) {
  // Watch actual thread readiness instead of polling the entire DOM ~31 times
  // per second during an opening chat (and competing with incoming messages).
  if (watchTimer) window.clearInterval(watchTimer);
  if (watchFrame) window.cancelAnimationFrame(watchFrame);
  watchObserver?.disconnect();
  watchFrame = 0;
  const started = Date.now();
  const check = () => {
    if (shellChatId !== chatId) return;
    const path = window.location.pathname;
    if (path.startsWith("/chat/") && realThreadIsReady()) {
      dismissPresentedChatThread();
      return;
    }
    if (Date.now() - started > 1200 && !path.startsWith("/chat/") &&
      document.documentElement.getAttribute("data-sayittome-chat-open") !== "1") {
      dismissPresentedChatThread();
      return;
    }
    if (Date.now() - started > 12000) dismissPresentedChatThread();
  };
  const scheduleCheck = () => {
    if (watchFrame || shellChatId !== chatId) return;
    watchFrame = window.requestAnimationFrame(() => {
      watchFrame = 0;
      check();
    });
  };
  if (typeof MutationObserver !== "undefined") {
    watchObserver = new MutationObserver(scheduleCheck);
    watchObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-chat-bubbles-settled", "data-sayittome-chat-open"],
    });
  }
  // Backup for navigation changes that don't mutate the document.
  watchTimer = window.setInterval(check, 400);
  scheduleCheck();
}

/** Cover the inbox until the real thread has its final bubble colors. */
export function presentChatThreadNow(href: string, _options?: { title?: string }) {
  if (typeof document === "undefined") return;
  const chatId = chatIdFromHref(href);
  if (!chatId || chatId === "new") return;

  const html = document.documentElement;
  html.setAttribute("data-sayittome-chat-open", "1");
  html.removeAttribute("data-sayittome-bar-target");

  let shell = document.getElementById(SHELL_ID);
  if (!shell) {
    shell = document.createElement("div");
    shell.id = SHELL_ID;
    document.body.appendChild(shell);
  }
  shell.replaceChildren();
  shellChatId = chatId;
  watchForRealThread(chatId);
}
