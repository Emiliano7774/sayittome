import { readCachedChatMessages } from "@/lib/chat/chatMessageCache";
import { readInboxSnapshot } from "@/lib/chat/inboxSnapshot";

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

function previewText(message: { text?: string; type?: string; viewOnce?: boolean }) {
  if (message.viewOnce) return "···";
  const text = String(message.text || "").trim();
  if (text) return text;
  if (message.type === "image") return "Foto";
  if (message.type === "video") return "Video";
  if (message.type === "audio") return "Audio";
  return "";
}

function findInboxRow(chatId: string) {
  return readInboxSnapshot().find(
    (row) => row.id === chatId || row.canonicalChatId === chatId,
  );
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

function realThreadIsMounted() {
  return Boolean(
    document.querySelector("[data-chat-thread-header], .sayittome-chat-shell"),
  );
}

function watchForRealThread(chatId: string) {
  if (watchTimer) window.clearInterval(watchTimer);
  const started = Date.now();
  watchTimer = window.setInterval(() => {
    if (shellChatId !== chatId) return;
    const path = window.location.pathname;
    if (path.startsWith("/chat/") && realThreadIsMounted()) {
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
 * Paint the tapped thread in the same pointerdown, from the inbox row and
 * the message cache, so the chats list cannot stay on top while the route loads.
 */
export function presentChatThreadNow(href: string, options?: { title?: string }) {
  if (typeof document === "undefined") return;
  const chatId = chatIdFromHref(href);
  if (!chatId || chatId === "new") return;

  const row = findInboxRow(chatId);
  const title =
    String(options?.title || "").trim() ||
    row?.targetUsername ||
    row?.receptorUsername ||
    row?.otherUsername ||
    "";

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

  const header = document.createElement("header");
  header.style.cssText =
    "flex:0 0 auto;padding:calc(0.85rem + env(safe-area-inset-top)) 1rem 0.85rem;border-bottom:1px solid rgba(255,255,255,0.08);font-size:17px;font-weight:700;letter-spacing:-0.02em;";
  header.textContent = title || "Chat";
  shell.appendChild(header);

  const scroller = document.createElement("div");
  scroller.style.cssText =
    "flex:1 1 auto;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;overflow:hidden;padding:12px 16px 8px;";

  const cached = readCachedChatMessages(chatId) || [];
  const bubbles = cached
    .slice(-12)
    .map((message) => ({
      text: previewText(message),
      mine: message.mine === true,
    }))
    .filter((message) => message.text);

  if (bubbles.length === 0 && row?.lastMessage) {
    bubbles.push({ text: String(row.lastMessage), mine: false });
  }

  for (const bubble of bubbles) {
    const node = document.createElement("p");
    node.textContent = bubble.text;
    node.style.cssText = bubble.mine
      ? "align-self:flex-end;max-width:78%;margin:0;padding:8px 12px;border-radius:16px;background:rgba(255,255,255,0.14);font-size:15px;line-height:1.35;"
      : "align-self:flex-start;max-width:78%;margin:0;padding:8px 12px;border-radius:16px;background:rgba(255,255,255,0.06);font-size:15px;line-height:1.35;";
    scroller.appendChild(node);
  }
  shell.appendChild(scroller);

  const composer = document.createElement("div");
  composer.style.cssText =
    "flex:0 0 auto;height:calc(4.5rem + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,0.06);";
  shell.appendChild(composer);

  shellChatId = chatId;
  watchForRealThread(chatId);
}
