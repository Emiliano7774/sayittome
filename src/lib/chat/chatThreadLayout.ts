/**
 * Profile anon chat column: header + one scroll center + composer.
 * Intro (avatar / modo anónimo card) lives inside the scroller so a tall
 * first-paint card cannot push the composer below visualViewport.
 */

export const CHAT_THREAD_COLUMN_CLASS = "sayittome-chat-thread flex h-full min-h-0 flex-col";
export const CHAT_THREAD_HEADER_CLASS =
  "sayittome-chat-thread-header flex shrink-0 items-center gap-4 bg-black px-5 py-4";
export const CHAT_THREAD_SCROLLER_CLASS =
  "sayittome-chat-thread-scroller min-h-0 flex-1 overflow-y-auto overscroll-contain";
export const CHAT_THREAD_COMPOSER_CLASS =
  "sayittome-chat-composer sayittome-chat-thread-composer shrink-0";
export const CHAT_THREAD_INTRO_CLASS = "sayittome-chat-thread-intro";
export const CHAT_THREAD_INTRO_SIBLING_CLASS =
  "sayittome-chat-thread-intro sayittome-chat-thread-intro--sibling shrink-0";

export const CLASSIC_INTRO_INNER_CLASS =
  "flex flex-col items-center justify-center px-6 pb-2 pt-[min(12vh,5rem)]";
export const MODERN_INTRO_INNER_CLASS =
  "flex min-h-[42vh] flex-col items-center justify-center px-6";

/** Structural CSS the React tree and the DOM gate share. */
export const CHAT_THREAD_LAYOUT_CSS = `
.sayittome-chat-thread {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sayittome-chat-thread-header {
  flex: 0 0 auto;
}
.sayittome-chat-thread-scroller {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sayittome-chat-thread-composer {
  flex: 0 0 auto;
}
.sayittome-chat-thread-intro--sibling {
  flex: 0 0 auto;
}
`;

export type AnonChatThreadIntroInput = {
  isClassic: boolean;
  isOwnerViewing: boolean;
  surfaceEngaged: boolean;
  authReady: boolean;
};

export function resolveAnonChatThreadIntro(input: AnonChatThreadIntroInput) {
  const showClassicIntro =
    input.isClassic && input.authReady && !input.isOwnerViewing && !input.surfaceEngaged;
  const showModernIntro =
    !input.isClassic && input.authReady && !input.isOwnerViewing && !input.surfaceEngaged;
  return {
    showClassicIntro,
    showModernIntro,
    showIntro: showClassicIntro || showModernIntro,
    introInScroller: true as const,
  };
}

export function shouldAutoscrollChatThread(input: {
  stickToBottom: boolean;
  showIntro: boolean;
}) {
  return input.stickToBottom && !input.showIntro;
}

export type ChatThreadBox = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
};

export function evaluateChatThreadLayout(input: {
  viewport: { top: number; bottom: number; width: number; height: number };
  header: ChatThreadBox | null;
  composer: ChatThreadBox | null;
  scroller: ChatThreadBox | null;
  intro: ChatThreadBox | null;
  introInsideScroller: boolean;
  scrollerScrollHeight?: number;
  scrollerClientHeight?: number;
}) {
  const reasons: string[] = [];
  const { viewport } = input;
  const slop = 0.5;

  function visible(box: ChatThreadBox | null, name: string) {
    if (!box || box.height < 8 || box.width < 8) {
      reasons.push(`${name}-missing`);
      return;
    }
    if (box.top < viewport.top - slop) reasons.push(`${name}-clipped-top`);
    if (box.bottom > viewport.bottom + slop) reasons.push(`${name}-clipped-bottom`);
    if (box.left < -slop || box.right > viewport.width + slop) {
      reasons.push(`${name}-clipped-x`);
    }
  }

  visible(input.header, "header");
  visible(input.composer, "composer");

  if (!input.scroller || input.scroller.height < 8) reasons.push("scroller-not-positive");
  if (input.intro && !input.introInsideScroller) reasons.push("intro-outside-scroller");
  if (input.composer && input.composer.bottom > viewport.bottom + slop) {
    reasons.push("composer-below-viewport");
  }
  if (input.composer && input.header && input.composer.top < input.header.bottom - slop) {
    reasons.push("composer-under-header");
  }
  if (
    input.intro &&
    input.scroller &&
    (input.scrollerScrollHeight ?? 0) > (input.scrollerClientHeight ?? 0) + 1
  ) {
    // tall intro may scroll; that is required, not a failure
  } else if (
    input.intro &&
    input.scroller &&
    input.intro.height > input.scroller.height + 1 &&
    (input.scrollerScrollHeight ?? 0) <= (input.scrollerClientHeight ?? 0) + 1
  ) {
    reasons.push("intro-not-scrollable");
  }

  return { ok: reasons.length === 0, reasons };
}

export function isPublishedComposerPushedOut(input: {
  viewportBottom: number;
  composer: ChatThreadBox | null;
}) {
  if (!input.composer || input.composer.height < 1) return true;
  return input.composer.bottom > input.viewportBottom + 0.5;
}

export function buildAnonChatThreadInnerHtml(input: {
  variant: "published" | "current";
  mode: "classic" | "modern";
  hasMessages?: boolean;
}) {
  const intro = resolveAnonChatThreadIntro({
    isClassic: input.mode === "classic",
    isOwnerViewing: false,
    surfaceEngaged: Boolean(input.hasMessages),
    authReady: true,
  });
  const introHtml = intro.showClassicIntro
    ? `<div data-chat-thread-intro="classic" class="${input.variant === "published" ? CHAT_THREAD_INTRO_SIBLING_CLASS : CHAT_THREAD_INTRO_CLASS}">
        <div class="${CLASSIC_INTRO_INNER_CLASS}" style="padding-top:min(12vh,5rem);padding-bottom:8px;display:flex;flex-direction:column;align-items:center">
          <div data-chat-intro-avatar style="width:128px;height:128px;border-radius:9999px;background:#222"></div>
          <div data-chat-intro-card style="margin-top:40px;width:min(320px,100%);padding:20px;border-radius:22px;background:#060606;color:#fff">
            <p style="font-size:11px;font-weight:900;letter-spacing:.32em;text-transform:uppercase;color:#a78bfa">Modo anónimo</p>
            <p style="margin-top:8px;font-size:18px;font-weight:900">Estás invisible</p>
            <p style="margin-top:8px;font-size:14px;line-height:1.5;color:rgba(255,255,255,.38)">Hablás sin mostrar tu identidad. La otra persona no sabe quién sos; este chat vive solo en esta sesión.</p>
            <p style="margin-top:12px;font-size:14px;line-height:1.5;color:rgba(255,255,255,.48)">Los mensajes se entregan en este hilo anónimo.</p>
            <p style="margin-top:8px;font-size:12px;line-height:1.4;color:rgba(255,255,255,.3)">Si te responden, vas a ver la alerta acá.</p>
            <p style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:rgba(255,255,255,.22)">Sos: Anon 1842</p>
          </div>
        </div>
      </div>`
    : intro.showModernIntro
      ? `<div data-chat-thread-intro="modern" class="${input.variant === "published" ? CHAT_THREAD_INTRO_SIBLING_CLASS : CHAT_THREAD_INTRO_CLASS}">
          <div class="${MODERN_INTRO_INNER_CLASS}" style="min-height:42vh;padding:0 24px;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div data-chat-intro-avatar style="width:96px;height:96px;border-radius:9999px;background:#222"></div>
            <h2 style="margin-top:24px;font-size:48px;font-weight:900;letter-spacing:-.08em">ada</h2>
            <div data-chat-intro-card style="margin-top:32px;width:100%;max-width:420px;border-radius:28px;background:#ececec;color:#000;padding:20px 24px">
              <p style="font-size:24px;font-weight:700;color:#7c3aed">Mantenemos tu anonimato</p>
              <p style="margin-top:4px;font-size:20px;color:#52525b">No sabrán quién sos.</p>
              <p style="margin-top:12px;font-size:16px;color:#a1a1aa">Sos: Anon 1842</p>
              <p style="margin-top:16px;font-size:14px;line-height:1.5;color:#71717a">Los mensajes se entregan en este hilo anónimo.</p>
              <p style="margin-top:8px;font-size:12px;line-height:1.4;color:#a1a1aa">Si te responden, vas a ver la alerta acá.</p>
            </div>
          </div>
        </div>`
      : "";

  const messagesHtml = input.hasMessages
    ? `<div data-chat-thread-messages style="display:flex;flex-direction:column;justify-content:flex-end;min-height:100%">
        <div style="align-self:flex-start;margin:8px 0;padding:10px 14px;border-radius:16px;background:#222">hola</div>
        <div style="align-self:flex-end;margin:8px 0;padding:10px 14px;border-radius:16px;background:#7c3aed">hey</div>
      </div>`
    : `<div data-chat-thread-messages></div>`;

  const headerHtml = `<header data-chat-thread-header class="${CHAT_THREAD_HEADER_CLASS}" style="padding:16px 20px">
    <span style="font-size:32px">‹</span>
    <div style="width:36px;height:36px;border-radius:9999px;background:#333"></div>
    <h1 style="margin:0;font-size:20px;font-weight:700">ada</h1>
  </header>`;
  const composerHtml = `<div data-chat-thread-composer class="${CHAT_THREAD_COMPOSER_CLASS}" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.05);background:#000">
    <div data-chat-composer-controls style="display:flex;align-items:center;gap:8px;min-height:48px">
      <input style="flex:1;min-height:48px;border-radius:9999px;border:1px solid #333;background:#111;color:#fff;padding:0 16px" placeholder="Mensaje" />
      <button type="button" style="min-width:48px;min-height:48px;border-radius:16px;background:#7c3aed;color:#fff;border:0">Enviar</button>
    </div>
  </div>`;
  const scrollerInner = `${input.variant === "current" ? introHtml : ""}${messagesHtml}`;
  const scrollerHtml = `<div data-chat-thread-scroller class="${CHAT_THREAD_SCROLLER_CLASS}">${scrollerInner}</div>`;

  if (input.variant === "published") {
    return `${headerHtml}${introHtml}${scrollerHtml}${composerHtml}`;
  }
  return `${headerHtml}${scrollerHtml}${composerHtml}`;
}
