import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyAnonReviewBucket } from "../src/lib/admin/anonReviewBucket.ts";

const tests = [
 ["asd_anon_a_anon_b",{source:"shuffle_direct",tipo:"anon_con_anonimo"},"direct"],
 ["asd_anon_a_anon_b",{tipo:"anon_con_anonimo"},"direct"],
 ["aad_anon_a_anon_b_timestamp",{tipo:"anon_con_anonimo"},"match"],
 ["pad_profile_anon_time",{tipo:"perfil_con_anonimo"},"match"],
 ["apd_anon_profile_time",{tipo:"anon_con_perfil"},"match"],
 ["ppd_profile_profile_time",{tipo:"perfil_con_perfil"},"match"],
 ["historic-doc",{receptorUid:"uid",anonId:"anon_alias",visitorId:"visitor"},"legacy_profile"],
 ["historic-doc",{receptorUsername:"someone",fingerprintAnonimo:"fingerprint"},"legacy_profile"],
 ["conflicting",{source:"shuffle_direct",chatId:"aad_someone"},"unclassified"],
 ["unknown",{},"unclassified"],
];
for(const [id,doc,want] of tests)assert.equal(classifyAnonReviewBucket(id,doc),want,id);
const snapshotPath = "scripts/backups/anon-review-split-20261013/pre-migration-full-snapshot.json";
let byBucket = null;
// Full live inventory fixture stays private/local; the deterministic unit cases
// above must also pass in a clean CI checkout without production data.
if (fs.existsSync(snapshotPath)) {
 const snapshot = JSON.parse(fs.readFileSync(snapshotPath,"utf8"));
 const counts={direct:0,match:0,legacy_profile:0,unclassified:0},ids=new Set();
 for(const row of snapshot.rows){
  const bucket=classifyAnonReviewBucket(row.id,row.data);
  counts[bucket]++;
  assert.ok(!ids.has(row.id),"duplicate_id");
  ids.add(row.id);
 }
 assert.equal(ids.size,snapshot.rows.length);
 assert.deepEqual(counts,{direct:18,match:196,legacy_profile:412,unclassified:0});
 byBucket=counts;
}
console.log(JSON.stringify({gate:"ANON_REVIEW_BUCKET_SPLIT",pass:true,counts:byBucket}));
