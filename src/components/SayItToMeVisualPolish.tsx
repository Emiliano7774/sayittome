"use client";

import { useEffect } from "react";

const ICONS: Record<string, string> = {
  "❤️": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2s-7.2-4.4-9.4-9A5.4 5.4 0 0 1 12 5.7a5.4 5.4 0 0 1 9.4 5.5c-2.2 4.6-9.4 9-9.4 9Z"/></svg>`,
  "🤍": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2s-7.2-4.4-9.4-9A5.4 5.4 0 0 1 12 5.7a5.4 5.4 0 0 1 9.4 5.5c-2.2 4.6-9.4 9-9.4 9Z"/></svg>`,
  "💬": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.4 18.4c-1.8-1.5-2.9-3.6-2.9-6 0-4.8 4.4-8.7 9.8-8.7s9.8 3.9 9.8 8.7-4.4 8.7-9.8 8.7c-1.1 0-2.2-.2-3.2-.5L4 22l1.4-3.6Z"/></svg>`,
  "👤": `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="stmTitaniumUser" x1="4" y1="2" x2="20" y2="22"><stop offset="0%" stop-color="#ffffff"/><stop offset="38%" stop-color="#cfd3dc"/><stop offset="70%" stop-color="#7f8796"/><stop offset="100%" stop-color="#f4f7ff"/></linearGradient></defs><path fill="url(#stmTitaniumUser)" d="M12 12.2a4.7 4.7 0 1 0 0-9.4 4.7 4.7 0 0 0 0 9.4Zm0 2.1c-4.5 0-8.2 2.5-8.2 5.6 0 .7.5 1.2 1.2 1.2h14c.7 0 1.2-.5 1.2-1.2 0-3.1-3.7-5.6-8.2-5.6Z"/></svg>`,
  "📖": `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 5.1c0-.8.6-1.4 1.4-1.4H10c1.1 0 2 .4 2.7 1.1.7-.7 1.6-1.1 2.7-1.1h4.4c.8 0 1.4.6 1.4 1.4v13.1c0 .8-.6 1.4-1.4 1.4h-4.4c-.8 0-1.6.3-2.1.9l-.6.6-.6-.6a3 3 0 0 0-2.1-.9H5.6c-.8 0-1.4-.6-1.4-1.4V5.1Zm8.5 2v11.1c.8-.5 1.7-.8 2.7-.8H19V5.9h-3.6c-1.5 0-2.7.5-2.7 1.2Zm-2.7-1.2H6.4v11.5H10c1 0 1.9.3 2.7.8V7.1c0-.7-1.2-1.2-2.7-1.2Z"/></svg>`,
};

function polishTextNodes(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest("[data-stm-polished='true']")) continue;
    if (/[❤️🤍💬👤📖]/u.test(node.nodeValue || "")) nodes.push(node);
  }

  for (const node of nodes) {
    const text = node.nodeValue || "";
    const frag = document.createDocumentFragment();

    for (const char of Array.from(text)) {
      if (ICONS[char]) {
        const span = document.createElement("span");
        span.className = `stm-minimal-icon stm-minimal-icon-${char === "👤" ? "user" : "ui"}`;
        span.dataset.stmPolished = "true";
        span.innerHTML = ICONS[char];
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(char));
      }
    }

    node.parentNode?.replaceChild(frag, node);
  }
}

export default function SayItToMeVisualPolish() {
  useEffect(() => {
    const styleId = "stm-visual-polish-style";

    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        .stm-minimal-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 0.95em;
          height: 0.95em;
          line-height: 1;
          vertical-align: -0.08em;
          color: currentColor;
          filter: drop-shadow(0 10px 22px rgba(255,255,255,.16));
        }

        .stm-minimal-icon svg {
          width: 100%;
          height: 100%;
          display: block;
        }

        .stm-minimal-icon-ui svg path {
          fill: currentColor;
        }

        .stm-minimal-icon-user {
          color: #eef2f8;
          filter:
            drop-shadow(0 8px 18px rgba(255,255,255,.2))
            drop-shadow(0 18px 38px rgba(142,117,255,.18));
        }

        .stm-minimal-icon-user svg path {
          fill: url(#stmTitaniumUser);
        }
      `;
      document.head.appendChild(style);
    }

    const run = () => polishTextNodes(document.body);
    run();

    const observer = new MutationObserver(() => run());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
