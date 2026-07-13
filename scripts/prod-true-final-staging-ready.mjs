/**
 * Final deploy staging readiness gate — poll until TRUE runtime hash is stable.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STAGING_MANIFEST_STABLE_SAMPLES_REQUIRED = 2;
export const DEFAULT_STAGING_POLL_MS = 750;
export const DEFAULT_STAGING_TIMEOUT_MS = 20 * 60 * 1000;

export function findMicroSlideRuntimeChunk(searchDir) {
  if (!fs.existsSync(searchDir)) return null;
  const stack = [searchDir];
  const candidates = [];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      let text;
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const hasActivation =
        text.includes("micro-slide-activation-v10") ||
        text.includes("getMicroSlideBuildDefault") ||
        text.includes("microSlideBuildFlag");
      const hasFlagLiteral = text.includes("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE");
      if (!hasActivation && !hasFlagLiteral) continue;
      const hasTrue =
        text.includes("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:!0") ||
        /MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*!0/.test(text) ||
        /MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*true/.test(text);
      const hasFalse =
        text.includes("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:!1") ||
        /MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*!1/.test(text) ||
        /MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*false/.test(text);
      candidates.push({
        path: full,
        relativePath: path.relative(searchDir, full).replace(/\\/g, "/"),
        sha256: crypto.createHash("sha256").update(text).digest("hex"),
        compiledFlagTrue: hasTrue && !hasFalse,
        compiledFlagFalse: hasFalse && !hasTrue,
        hasFlagLiteral,
        hasActivation,
      });
    }
  }
  // Prefer the chunk that actually embeds the production default flag literal.
  const withFlag = candidates.find((c) => c.hasFlagLiteral);
  if (withFlag) return withFlag;
  return candidates[0] ?? null;
}

export function countStagingFiles(stagingDir) {
  if (!fs.existsSync(stagingDir)) return 0;
  let count = 0;
  const stack = [stagingDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else count += 1;
    }
  }
  return count;
}

export function stagingManifestHash(stagingDir) {
  if (!fs.existsSync(stagingDir)) return null;
  const rows = [];
  const stack = [{ dir: stagingDir, rel: "" }];
  while (stack.length) {
    const { dir, rel } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) stack.push({ dir: abs, rel: relPath });
      else {
        try {
          const buf = fs.readFileSync(abs);
          rows.push(`${relPath}:${crypto.createHash("sha256").update(buf).digest("hex")}`);
        } catch {
          return null;
        }
      }
    }
  }
  rows.sort();
  return crypto.createHash("sha256").update(rows.join("\n")).digest("hex");
}

export function sampleStagingState(stagingDir, expectedTrueHash, chunksRel = "_next/static/chunks") {
  const chunkDir = path.join(stagingDir, chunksRel);
  const runtimeChunk = findMicroSlideRuntimeChunk(chunkDir);
  const fileCount = countStagingFiles(stagingDir);
  const manifestHash = fileCount > 0 ? stagingManifestHash(stagingDir) : null;
  const trueHashMatch =
    expectedTrueHash != null &&
    runtimeChunk?.sha256 != null &&
    runtimeChunk.sha256 === expectedTrueHash;
  const falseArtifactDetected = runtimeChunk?.compiledFlagFalse === true && !trueHashMatch;

  return {
    fileCount,
    manifestHash,
    runtimeAssetPath: runtimeChunk?.relativePath ?? null,
    runtimeAssetHash: runtimeChunk?.sha256 ?? null,
    trueHashMatch,
    falseArtifactDetected,
    compiledFlagTrue: runtimeChunk?.compiledFlagTrue === true,
    compiledFlagFalse: runtimeChunk?.compiledFlagFalse === true,
  };
}

/**
 * Evaluate whether final staging is ready from accumulated poll samples.
 * Used by harness and live observer.
 */
export function evaluateFinalStagingReady(samples, expectedTrueHash, {
  stableSamplesRequired = STAGING_MANIFEST_STABLE_SAMPLES_REQUIRED,
} = {}) {
  if (!samples.length || expectedTrueHash == null) {
    return {
      FINAL_DEPLOY_STAGING_READY: false,
      STAGING_MANIFEST_STABLE_SAMPLES: 0,
      STAGING_TRANSIENT_PRE_REBUILD_FALSE_OBSERVED: false,
      reason: "no-samples-or-hash",
    };
  }

  const transientFalse = samples.some((s) => s.falseArtifactDetected === true);
  let stableRun = 0;
  let lastManifest = null;
  let readySample = null;

  for (const sample of samples) {
    if (sample.manifestHash == null) {
      stableRun = 0;
      lastManifest = null;
      continue;
    }
    if (sample.manifestHash === lastManifest) stableRun += 1;
    else {
      stableRun = 1;
      lastManifest = sample.manifestHash;
    }

    if (
      sample.trueHashMatch === true &&
      stableRun >= stableSamplesRequired
    ) {
      readySample = sample;
      break;
    }
  }

  return {
    FINAL_DEPLOY_STAGING_READY: readySample != null,
    STAGING_MANIFEST_STABLE_SAMPLES: readySample ? stableSamplesRequired : 0,
    STAGING_TRANSIENT_PRE_REBUILD_FALSE_OBSERVED: transientFalse,
    readySample,
    reason: readySample ? "stable-true-hash" : transientFalse ? "awaiting-true-or-stability" : "not-ready",
  };
}

export function evaluateHarnessScenario(scenario) {
  const { samples, expectedTrueHash, deployEnded, deployExitCode = 0, timeout = false } = scenario;
  const evalResult = evaluateFinalStagingReady(samples, expectedTrueHash);
  const everTrue = samples.some((s) => s.trueHashMatch === true);

  if (timeout && !evalResult.FINAL_DEPLOY_STAGING_READY) {
    return { pass: false, reason: "timeout" };
  }

  if (deployEnded && deployExitCode !== 0) {
    return { pass: false, reason: "deploy-error" };
  }

  if (deployEnded && !everTrue && !evalResult.FINAL_DEPLOY_STAGING_READY) {
    return { pass: false, reason: "deploy-ended-never-true" };
  }

  if (evalResult.FINAL_DEPLOY_STAGING_READY) {
    const last = samples[samples.length - 1];
    if (last && !last.trueHashMatch) {
      return { pass: false, reason: "manifest-changed-after-ready" };
    }
    if (expectedTrueHash && evalResult.readySample?.runtimeAssetHash !== expectedTrueHash) {
      return { pass: false, reason: "wrong-hash" };
    }
    return { pass: true, reason: "ready" };
  }

  if (deployEnded && everTrue) {
    return { pass: false, reason: "true-unstable-at-deploy-end" };
  }

  return { pass: false, reason: "incomplete" };
}
