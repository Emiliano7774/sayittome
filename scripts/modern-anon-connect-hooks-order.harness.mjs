/**
 * Guards ModernAnonConnectCard against conditional hooks after early returns.
 * Also mirrors classic vs buggy hook-order with a pure static check.
 *
 * Usage: node scripts/modern-anon-connect-hooks-order.harness.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modernPath = path.join(
  rootDir,
  "src/components/anonMatch/ModernAnonConnectCard.tsx",
);
const classicPath = path.join(
  rootDir,
  "src/components/anonMatch/ClassicAnonConnectCard.tsx",
);

function analyze(src) {
  const lines = src.split(/\r?\n/);
  let exportStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^export default function /.test(lines[i])) {
      exportStart = i;
      break;
    }
  }
  let firstEarlyReturn = -1;
  let firstLateHook = -1;
  let lastUnconditionalHook = -1;
  for (let i = Math.max(0, exportStart); i < lines.length; i++) {
    const line = lines[i];
    if (
      firstEarlyReturn < 0 &&
      /^\s*if\s*\(.*\)\s*return null;/.test(line)
    ) {
      firstEarlyReturn = i + 1;
      continue;
    }
    const isHook =
      /^\s*(const\s+\w+\s*=\s*useCallback|useOverlayBackClose|useEffect|useMemo|useLayoutEffect|useSyncExternalStore)\b/.test(
        line,
      ) || /^\s*const\s+\[.+\]\s*=\s*useState\b/.test(line);
    if (!isHook) continue;
    if (firstEarlyReturn < 0) {
      lastUnconditionalHook = i + 1;
    } else if (firstLateHook < 0) {
      firstLateHook = i + 1;
    }
  }
  return {
    exportStart: exportStart + 1,
    firstEarlyReturn,
    firstLateHook,
    lastUnconditionalHook,
    hooksBeforeReturns: firstEarlyReturn > 0 && firstLateHook < 0,
  };
}

const modernSrc = fs.readFileSync(modernPath, "utf8");
const classicSrc = fs.readFileSync(classicPath, "utf8");
const modern = analyze(modernSrc);
const classic = analyze(classicSrc);

const buggyPatternPresent = /if \(!match \|\| loading\) return null;[\s\S]*useCallback\(/.test(
  modernSrc,
);

const report = {
  gate: "MODERN_ANON_CONNECT_HOOKS_ORDER",
  modern: {
    file: "src/components/anonMatch/ModernAnonConnectCard.tsx",
    ...modern,
  },
  classic: {
    file: "src/components/anonMatch/ClassicAnonConnectCard.tsx",
    ...classic,
  },
  buggyPatternPresent,
  pass:
    modern.hooksBeforeReturns &&
    classic.hooksBeforeReturns &&
    !buggyPatternPresent &&
    modernSrc.includes("useOverlayBackClose") &&
    modernSrc.includes("useCallback"),
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
