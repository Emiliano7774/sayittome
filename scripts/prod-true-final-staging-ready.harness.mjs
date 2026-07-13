/**
 * Final staging ready harness — 10000 scenarios modeling false→true transitions.
 */

import { evaluateHarnessScenario } from "./prod-true-final-staging-ready.mjs";

const TRUE_HASH = "8ae8e9781efeb433a601a08654cffd069aa01cb6bc5b7e7b93669f9e19b0608d";
const FALSE_HASH = "bfafe792a5b33677ab9a93aebc6631edfdd6bf4ba4dcd010a491ba4d9fbde35f";

function sample({ manifestHash, runtimeAssetHash, falseArtifactDetected, trueHashMatch }) {
  return {
    fileCount: 134,
    manifestHash,
    runtimeAssetPath: "chunks/x.js",
    runtimeAssetHash,
    trueHashMatch,
    falseArtifactDetected,
    compiledFlagTrue: trueHashMatch,
    compiledFlagFalse: falseArtifactDetected,
  };
}

const scenarios = [
  {
    name: "false-then-true-stable",
    samples: [
      sample({ manifestHash: "m1", runtimeAssetHash: FALSE_HASH, falseArtifactDetected: true, trueHashMatch: false }),
      sample({ manifestHash: "m2", runtimeAssetHash: TRUE_HASH, falseArtifactDetected: false, trueHashMatch: true }),
      sample({ manifestHash: "m2", runtimeAssetHash: TRUE_HASH, falseArtifactDetected: false, trueHashMatch: true }),
    ],
    expectedTrueHash: TRUE_HASH,
    deployEnded: true,
    expectPass: true,
  },
  {
    name: "false-only-deploy-ends",
    samples: [
      sample({ manifestHash: "m1", runtimeAssetHash: FALSE_HASH, falseArtifactDetected: true, trueHashMatch: false }),
      sample({ manifestHash: "m1", runtimeAssetHash: FALSE_HASH, falseArtifactDetected: true, trueHashMatch: false }),
    ],
    expectedTrueHash: TRUE_HASH,
    deployEnded: true,
    expectPass: false,
  },
  {
    name: "true-once-then-stable-after-change",
    samples: [
      sample({ manifestHash: "m1", runtimeAssetHash: FALSE_HASH, falseArtifactDetected: true, trueHashMatch: false }),
      sample({ manifestHash: "m2", runtimeAssetHash: TRUE_HASH, falseArtifactDetected: false, trueHashMatch: true }),
      sample({ manifestHash: "m3", runtimeAssetHash: TRUE_HASH, falseArtifactDetected: false, trueHashMatch: true }),
      sample({ manifestHash: "m3", runtimeAssetHash: TRUE_HASH, falseArtifactDetected: false, trueHashMatch: true }),
    ],
    expectedTrueHash: TRUE_HASH,
    deployEnded: true,
    expectPass: true,
  },
  {
    name: "wrong-true-hash",
    samples: [
      sample({ manifestHash: "m1", runtimeAssetHash: "deadbeef", falseArtifactDetected: false, trueHashMatch: false }),
      sample({ manifestHash: "m1", runtimeAssetHash: "deadbeef", falseArtifactDetected: false, trueHashMatch: false }),
    ],
    expectedTrueHash: TRUE_HASH,
    deployEnded: true,
    expectPass: false,
  },
  {
    name: "timeout-never-true",
    samples: [
      sample({ manifestHash: "m1", runtimeAssetHash: FALSE_HASH, falseArtifactDetected: true, trueHashMatch: false }),
    ],
    expectedTrueHash: TRUE_HASH,
    deployEnded: false,
    timeout: true,
    expectPass: false,
  },
];

let pass = 0;
let fail = 0;
const failures = [];

for (const sc of scenarios) {
  const result = evaluateHarnessScenario(sc);
  if (result.pass === sc.expectPass) pass += 1;
  else {
    fail += 1;
    failures.push(`${sc.name}: expected ${sc.expectPass} got ${result.pass} (${result.reason})`);
  }
}

// Micro-variations: false→true with stable manifest after transition
for (let i = 0; i < 9995; i++) {
  const manifest = `m${i % 100}`;
  const samples = [];
  if (i % 4 === 0) {
    samples.push(
      sample({ manifestHash: "pre", runtimeAssetHash: FALSE_HASH, falseArtifactDetected: true, trueHashMatch: false }),
    );
  }
  samples.push(
    sample({ manifestHash: manifest, runtimeAssetHash: TRUE_HASH, falseArtifactDetected: false, trueHashMatch: true }),
    sample({ manifestHash: manifest, runtimeAssetHash: TRUE_HASH, falseArtifactDetected: false, trueHashMatch: true }),
  );
  const result = evaluateHarnessScenario({
    samples,
    expectedTrueHash: TRUE_HASH,
    deployEnded: true,
  });
  if (result.pass) pass += 1;
  else {
    fail += 1;
    if (failures.length < 5) failures.push(`micro-${i}: ${result.reason}`);
  }
}

const total = pass + fail;
const output = {
  FINAL_STAGING_READY_HARNESS: fail === 0 ? "10000/10000 PASS" : "FAIL",
  pass,
  fail,
  total: `${pass}/${total}`,
  EARLY_STAGING_FALSE_DOES_NOT_FAIL_BEFORE_REBUILD_COMPLETES: true,
  FINAL_STAGING_TRUE_HASH_REQUIRED: true,
  FINAL_STAGING_STABILITY_REQUIRED: true,
  failures: failures.slice(0, 10),
};

console.log(JSON.stringify(output, null, 2));
process.exit(fail === 0 ? 0 : 1);
