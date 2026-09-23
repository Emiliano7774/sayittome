const SHELL_ID = "sayittome-chat-open-shell";

let shellChatId = "";
let watchTimer = 0;

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
  if (watchTimer) window.clearInterval(watchTimer);
  const started = Date.now();
  watchTimer = window.setInterval(() => {
    if (shellChatId !== chatId) return;
    const path = window.location.pathname;
    if (path.startsWith("/chat/") && realThreadIsReady()) {
      dismissPresentedChatThread();
      return;
    }
    if (!path.startsWith("/chat/") && Date.now() - started > 1200) {
      const stillMarked =
        document.documentElement.getAttribute("data-sayittome-chat-open") === "1";
      if (!stillMarked) dismissPresentedChatThread();
    }
    if (Date.now() - started > 12000) dismissPresentedChatThread();
  }, 32);
}

/**
 * Cover the inbox on tap. Do not paint message bubbles here: they show as
 * uncolored rounded shapes and then jump to the real colors.
 */
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
