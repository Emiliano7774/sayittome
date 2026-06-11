import { logMonetag } from "@/lib/monetization/monetagDev";
import { MONETAG_SHUFFLE_INLINE } from "@/lib/monetization/monetagZones";

const mountedSlots = new Set<string>();

function buildShuffleInlineFrameHtml(slotId: string) {
  const { zoneId, src } = MONETAG_SHUFFLE_INLINE;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #111; overflow: hidden; }
      body { min-height: 96px; display: flex; align-items: stretch; justify-content: center; }
      #stm-monetag-root { width: 100%; min-height: 96px; }
    </style>
  </head>
  <body>
    <div id="stm-monetag-root" data-slot="${slotId}"></div>
    <script data-cfasync="false">
      (function (d, z, u, slot) {
        var root = d.getElementById("stm-monetag-root");
        if (!root) return;
        var s = d.createElement("script");
        s.async = true;
        s.src = u;
        s.dataset.zone = z;
        s.dataset.cfasync = "false";
        s.dataset.requestVar = slot;
        root.appendChild(s);
      })(document, "${zoneId}", "${src}", "${slotId}");
    <\/script>
  </body>
</html>`;
}

export function mountMonetagShuffleInlineAd(container: HTMLElement, slotId: string) {
  if (mountedSlots.has(slotId)) return;
  mountedSlots.add(slotId);

  container.innerHTML = "";

  const frame = document.createElement("iframe");
  frame.title = "Publicidad";
  frame.className = "h-[120px] w-full border-0 bg-[#111]";
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer-when-downgrade";
  frame.sandbox = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
  frame.srcdoc = buildShuffleInlineFrameHtml(slotId);

  container.appendChild(frame);
  logMonetag("shuffle-inline-mounted", { slotId, zone: MONETAG_SHUFFLE_INLINE.zoneId });
}

export function unmountMonetagShuffleInlineAd(slotId: string) {
  mountedSlots.delete(slotId);
}
