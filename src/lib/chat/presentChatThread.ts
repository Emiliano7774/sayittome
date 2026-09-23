import { chatBubbleShellClass, chatBubbleTextClass } from "@/lib/chat/chatBubbleStyles";
import { readCachedChatMessages } from "@/lib/chat/chatMessageCache";

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

function isClassicUx() {
  try {
    return window.localStorage.getItem("sayittome_ux_mode") !== "modern";
  } catch {
    return true;
  }
}

function previewText(message: { text?: string; type?: string; viewOnce?: boolean }) {
  if (message.viewOnce) return "···";
  const text = String(message.text || "").trim();
  if (text) return text;
  if (message.type === "image") return "Foto";
  if (message.type === "video") return "Video";
  if (message.type === "audio") return "Audio";
  return "";
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
 * Cover the inbox on tap with the same colored bubbles the thread will use,
 * then drop the cover on the first real paint. No extra hold after that.
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

  const classic = isClassicUx();
  const scroller = document.createElement("div");
  scroller.style.cssText =
    "margin-top:auto;display:flex;flex-direction:column;gap:8px;padding:12px 16px calc(5.5rem + env(safe-area-inset-bottom));";

  const cached = readCachedChatMessages(chatId) || [];
  for (const message of cached.slice(-12)) {
    const text = previewText(message);
    if (!text) continue;
    const mine = message.mine === true;
    const bubble = document.createElement("div");
    bubble.className = [
      mine ? "self-end" : "self-start",
      chatBubbleShellClass(classic, mine),
    ].join(" ");
    const label = document.createElement("p");
    label.className = chatBubbleTextClass(classic);
    label.textContent = text;
    bubble.appendChild(label);
    scroller.appendChild(bubble);
  }
  shell.appendChild(scroller);

  shellChatId = chatId;
  watchForRealThread(chatId);
}
