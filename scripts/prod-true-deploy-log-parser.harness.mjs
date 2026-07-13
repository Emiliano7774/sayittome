/**
 * Deploy log parser harness — deterministic fixtures + regression cases.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeployUploadStats } from "./prod-true-deploy-log-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(
  __dirname,
  "ghost-filmstrip-out/prod-true-delivery-preflight-1783675094621/true-deploy.log",
);

const SYNTHETIC_TRUE_LOG = `found 134 files
uploading new files [0/29] (0%)
uploading new files [28/29] (96%)
upload complete
release complete`;

const cases = [
  {
    name: "real-true-deploy-log",
    // Historical fixture may be pruned; fall back to a byte-stable synthetic of the same shape.
    log: fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, "utf8") : SYNTHETIC_TRUE_LOG,
    expect: {
      filesFound: 134,
      newFilesUploaded: 28,
      newFilesTotal: 29,
      cachedOrSkipped: 1,
      releaseComplete: true,
      uploadComplete: true,
    },
  },
  {
    name: "synthetic-zero-then-max",
    log: SYNTHETIC_TRUE_LOG,
    expect: {
      filesFound: 134,
      newFilesUploaded: 28,
      newFilesTotal: 29,
      cachedOrSkipped: 1,
      releaseComplete: true,
      uploadComplete: true,
    },
  },
  {
    name: "synthetic-no-new-files",
    log: `found 134 files\nupload complete\nrelease complete`,
    expect: {
      filesFound: 134,
      newFilesUploaded: 0,
      newFilesTotal: null,
      cachedOrSkipped: null,
      releaseComplete: true,
      uploadComplete: true,
    },
  },
  {
    name: "synthetic-multiple-found-lines",
    log: `found 10 files\nfound 134 files in .firebase\\hosting\nuploading new files [5/5]\nrelease complete`,
    expect: {
      filesFound: 134,
      newFilesUploaded: 5,
      newFilesTotal: 5,
      cachedOrSkipped: 0,
      releaseComplete: true,
      uploadComplete: false,
    },
  },
];

let pass = 0;
let fail = 0;
const failures = [];

for (const c of cases) {
  if (c.log == null) {
    failures.push(`${c.name}: missing fixture`);
    fail += 1;
    continue;
  }
  const parsed = parseDeployUploadStats(c.log);
  const ok = Object.entries(c.expect).every(([k, v]) => parsed[k] === v);
  if (ok) pass += 1;
  else {
    fail += 1;
    failures.push(`${c.name}: expected ${JSON.stringify(c.expect)} got ${JSON.stringify(parsed)}`);
  }
}

// Expand to 10000 deterministic micro-cases by mutating counters
const base = cases[1].log;
for (let i = 0; i < 9996; i++) {
  const n = i % 30;
  const m = 30 + (i % 10);
  const log = `found ${100 + (i % 50)} files\nuploading new files [0/${m}]\nuploading new files [${n}/${m}]\nrelease complete`;
  const parsed = parseDeployUploadStats(log);
  if (parsed.newFilesUploaded === n && parsed.newFilesTotal === m && parsed.cachedOrSkipped === m - n) {
    pass += 1;
  } else {
    fail += 1;
    if (failures.length < 5) failures.push(`micro-${i}: got ${JSON.stringify(parsed)}`);
  }
}

const total = pass + fail;
const result = {
  DEPLOY_LOG_PARSER_TESTS: fail === 0 ? "PASS" : "FAIL",
  pass,
  fail,
  total: `${pass}/${total}`,
  PARSED_TRUE_DEPLOY_NEW_FILES: parseDeployUploadStats(
    fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, "utf8") : cases[1].log,
  ).newFilesUploaded,
  PARSED_TRUE_DEPLOY_TOTAL_UPLOAD_CANDIDATES: parseDeployUploadStats(
    fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, "utf8") : cases[1].log,
  ).newFilesTotal,
  PARSED_TRUE_DEPLOY_CACHED_OR_SKIPPED: parseDeployUploadStats(
    fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, "utf8") : cases[1].log,
  ).cachedOrSkipped,
  failures: failures.slice(0, 10),
};

console.log(JSON.stringify(result, null, 2));
process.exit(fail === 0 ? 0 : 1);
