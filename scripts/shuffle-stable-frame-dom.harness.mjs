/**
 * Playwright DOM gate: real getBoundingClientRect/offsetHeight for shuffle chrome.
 * Usage: node --experimental-strip-types scripts/shuffle-stable-frame-dom.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, devices } from "playwright";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const { CLASSIC_SHUFFLE_DENSITY_OPTIONS } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/classicDensity.ts")).href
);
const { getClassicShuffleHeaderUi } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/classicHeaderUi.ts")).href
);
const { classicFollowingSlotStyles, classicAnonSlotStyles } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeStable.ts")).href
);

function cssBox(box, extras = "") {
  return [
    `margin-top:${box.marginTop}px`,
    `margin-bottom:${box.marginBottom}px`,
    `padding-top:${box.paddingTop}px`,
    `padding-bottom:${box.paddingBottom}px`,
    `min-height:${box.minHeight}px`,
    `height:${box.height}px`,
    `overflow:${box.overflow}`,
    box.borderTopWidth
      ? `border-top:${box.borderTopWidth}px solid rgba(255,255,255,0.06)`
      : "",
    box.borderBottomWidth
      ? `border-bottom:${box.borderBottomWidth}px solid rgba(255,255,255,0.1)`
      : "",
    extras,
  ]
    .filter(Boolean)
    .join(";");
}

function followingInner(ui, state) {
  const label = `<p style="margin:0;font-size:${ui.followingLabelPx}px;font-weight:500;letter-spacing:0.025em;text-transform:uppercase;color:rgba(255,255,255,0.4)">Following</p>`;
  const bodyWrap = (html) =>
    `<div data-shuffle-following-body="1" style="margin-top:8px;overflow:hidden;min-height:${ui.followingBodyPx}px">${html}</div>`;
  if (state === "skeleton") {
    const items = Array.from({ length: 4 }, () => {
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:${ui.followingItemWPx}px;flex-shrink:0">
        <div style="width:${ui.followingAvatarPx}px;height:${ui.followingAvatarPx}px;border-radius:9999px;background:rgba(255,255,255,0.06)"></div>
        <span style="display:block;height:${ui.followingTextPx}px;width:${Math.round(ui.followingItemWPx * 0.72)}px;border-radius:9999px;background:rgba(255,255,255,0.06)"></span>
      </div>`;
    }).join("");
    return `${label}${bodyWrap(`<div style="display:flex;gap:${ui.followingGapPx}px;overflow:hidden">${items}</div>`)}`;
  }
  if (state === "guest") {
    return `${label}${bodyWrap(`
      <p style="margin:0;font-size:${ui.followingTextPx}px;font-weight:500;line-height:1.375;color:rgba(255,255,255,0.38)">Sign in with your profile to follow people and see them here.</p>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:${ui.followingGapPx}px">
        <a style="display:inline-block;border:1px solid rgba(255,255,255,0.12);border-radius:9999px;font-weight:500;color:rgba(255,255,255,0.8);font-size:${ui.followingBtnTextPx}px;padding:${ui.followingBtnPadYPx}px ${ui.followingBtnPadXPx}px">Sign in</a>
        <a style="display:inline-block;border-radius:9999px;font-weight:500;background:#7c3aed;color:#fff;font-size:${ui.followingBtnTextPx}px;padding:${ui.followingBtnPadYPx}px ${ui.followingBtnPadXPx}px">Create profile</a>
      </div>
    `)}`;
  }
  return `${label}${bodyWrap(`
    <div style="display:flex;gap:${ui.followingGapPx}px;overflow-x:auto;padding-bottom:2px">
      <a style="display:flex;flex-shrink:0;flex-direction:column;align-items:center;gap:4px;width:${ui.followingItemWPx}px;color:inherit;text-decoration:none">
        <div style="position:relative;overflow:hidden;border-radius:9999px;background:#141414;width:${ui.followingAvatarPx}px;height:${ui.followingAvatarPx}px"></div>
        <span style="font-size:${ui.followingTextPx}px;font-weight:500;color:rgba(255,255,255,0.75);max-width:${ui.followingItemWPx}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">ada</span>
      </a>
    </div>
  `)}`;
}

function anonInner(ui, state) {
  if (state === "reserved") {
    return `
      <div style="display:flex;align-items:center;gap:${ui.followingGapPx}px">
        <div style="width:${ui.anonIconPx}px;height:${ui.anonIconPx}px;border-radius:9999px;background:rgba(255,255,255,0.06)"></div>
        <div style="height:${ui.anonTitlePx}px;width:42%;border-radius:9999px;background:rgba(255,255,255,0.06)"></div>
      </div>
      <div style="margin-top:6px;width:100%;border-radius:8px;background:rgba(255,255,255,0.06);height:${ui.anonBtnPadYPx * 2 + ui.anonBtnPx}px"></div>
    `;
  }
  if (state === "hidden") return "";
  return `
    <div style="display:flex;align-items:center;gap:${ui.followingGapPx}px">
      <div style="width:${ui.anonIconPx}px;height:${ui.anonIconPx}px;flex-shrink:0;border-radius:9999px;background:#7c3aed"></div>
      <p style="margin:0;font-size:${ui.anonTitlePx}px;font-weight:600;letter-spacing:-0.02em;color:rgba(255,255,255,0.88)">Connect anonymously</p>
    </div>
    <button type="button" style="margin-top:6px;width:100%;border-radius:8px;border:1px solid rgba(124,58,237,0.25);background:#5b21b6;color:#fff;font-weight:600;font-size:${ui.anonBtnPx}px;padding:${ui.anonBtnPadYPx}px 12px">Connect</button>
  `;
}

function chromeHtml(ui, followingState, anonState) {
  const followingBox = classicFollowingSlotStyles(ui);
  const anonBox = classicAnonSlotStyles(ui, true);
  return `
    <div data-chrome-root="1" style="width:100%;padding:0 16px;background:#000;color:#fff">
      <div data-shuffle-following-slot="1" data-shuffle-following-state="${followingState}" style="${cssBox(followingBox)}">
        ${followingInner(ui, followingState)}
      </div>
      <div data-shuffle-anon-slot="1" data-shuffle-anon-state="${anonState}" style="${cssBox(anonBox)}">
        ${anonInner(ui, anonState)}
      </div>
      <div data-feed-marker="1">FEED</div>
    </div>
  `;
}

const pageCss = `*,*::before,*::after{box-sizing:border-box;border-width:0;border-style:solid}
html,body{margin:0;padding:0;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;line-height:1.5}
button,a{font-family:inherit}`;

function shellHtml(inner) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${pageCss}</style></head><body>${inner}</body></html>`;
}

async function measure(page) {
  return page.evaluate(() => {
    function slotMetrics(el) {
      if (!el) {
        return {
          missing: true,
          offsetHeight: 0,
          height: 0,
          layoutPx: 0,
          overflow: false,
        };
      }
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const mt = Number.parseFloat(cs.marginTop) || 0;
      const mb = Number.parseFloat(cs.marginBottom) || 0;
      const padBottom = Number.parseFloat(cs.paddingBottom) || 0;
      const padRight = Number.parseFloat(cs.paddingRight) || 0;
      const borderBottom = Number.parseFloat(cs.borderBottomWidth) || 0;
      const borderRight = Number.parseFloat(cs.borderRightWidth) || 0;
      const contentBottom = rect.bottom - padBottom - borderBottom;
      const contentRight = rect.right - padRight - borderRight;
      let overflow =
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      for (const child of el.children) {
        const childRect = child.getBoundingClientRect();
        if (childRect.bottom > contentBottom + 1 || childRect.right > contentRight + 1) {
          overflow = true;
        }
      }
      return {
        missing: false,
        offsetHeight: el.offsetHeight,
        height: rect.height,
        layoutPx: mt + rect.height + mb,
        overflow,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    }

    const root = document.querySelector("[data-chrome-root]");
    const feed = document.querySelector("[data-feed-marker]");
    const following = document.querySelector("[data-shuffle-following-slot]");
    const anon = document.querySelector("[data-shuffle-anon-slot]");
    const body = document.querySelector("[data-shuffle-following-body]");
    return {
      following: slotMetrics(following),
      followingBody: slotMetrics(body),
      anon: slotMetrics(anon),
      feedOffset: feed.getBoundingClientRect().top - root.getBoundingClientRect().top,
    };
  });
}

function assertStable(before, after, label) {
  assert.equal(Math.round(before.feedOffset), Math.round(after.feedOffset), `${label} feedOffset`);
  assert.equal(
    Math.round(before.following.offsetHeight),
    Math.round(after.following.offsetHeight),
    `${label} following offsetHeight`,
  );
  assert.equal(
    Math.round(before.anon.offsetHeight),
    Math.round(after.anon.offsetHeight),
    `${label} anon offsetHeight`,
  );
  assert.equal(
    Math.round(before.following.height),
    Math.round(after.following.height),
    `${label} following getBoundingClientRect`,
  );
  assert.equal(
    Math.round(before.anon.height),
    Math.round(after.anon.height),
    `${label} anon getBoundingClientRect`,
  );
}

function assertNoOverflow(snap, label) {
  assert.equal(snap.following.overflow, false, `${label} following overflow`);
  assert.equal(snap.followingBody.overflow, false, `${label} following body overflow`);
  assert.equal(snap.anon.overflow, false, `${label} anon overflow`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();
const report = [];

try {
  for (const density of CLASSIC_SHUFFLE_DENSITY_OPTIONS) {
    const ui = getClassicShuffleHeaderUi(density);
    const transitions = [
      ["pending→show", "skeleton", "reserved", "rows", "show"],
      ["pending→guest", "skeleton", "reserved", "guest", "hidden"],
      ["pending→chat", "skeleton", "reserved", "rows", "hidden"],
    ];

    for (const [name, followA, anonA, followB, anonB] of transitions) {
      await page.setContent(shellHtml(chromeHtml(ui, followA, anonA)), {
        waitUntil: "domcontentloaded",
      });
      const pending = await measure(page);
      assert.equal(pending.following.missing, false, `${density} ${name} following slot`);
      assert.equal(pending.anon.missing, false, `${density} ${name} anon slot`);
      assertNoOverflow(pending, `density ${density} ${name} pending`);

      await page.evaluate(
        ({ followHtml, anonHtml, followState, anonState }) => {
          const following = document.querySelector("[data-shuffle-following-slot]");
          const anon = document.querySelector("[data-shuffle-anon-slot]");
          following.innerHTML = followHtml;
          following.setAttribute("data-shuffle-following-state", followState);
          anon.innerHTML = anonHtml;
          anon.setAttribute("data-shuffle-anon-state", anonState);
        },
        {
          followHtml: followingInner(ui, followB),
          anonHtml: anonInner(ui, anonB),
          followState: followB,
          anonState: anonB,
        },
      );

      const next = await measure(page);
      assertNoOverflow(next, `density ${density} ${name} after`);
      assertStable(pending, next, `density ${density} ${name}`);
      report.push({
        density,
        name,
        pendingFeedOffset: pending.feedOffset,
        nextFeedOffset: next.feedOffset,
        pendingFollowing: pending.following.offsetHeight,
        nextFollowing: next.following.offsetHeight,
        pendingAnon: pending.anon.offsetHeight,
        nextAnon: next.anon.offsetHeight,
      });
    }
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_STABLE_FRAME_DOM",
      pass: true,
      densities: CLASSIC_SHUFFLE_DENSITY_OPTIONS,
      samples: report.length,
    },
    null,
    2,
  ),
);
