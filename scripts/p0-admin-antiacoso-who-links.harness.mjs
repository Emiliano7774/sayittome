/**
 * P0_ADMIN_ANTiacoso_WHO_LINKS — static contract: who→who via verified profile links, not IP.
 * Does NOT substitute multimedia harness; physical admin session still PENDING.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const panelSrc = fs.readFileSync(
  path.join(root, "src/components/admin/panels/AdminAntiacosoPanel.tsx"),
  "utf8",
);
const resolveRouteSrc = fs.readFileSync(
  path.join(root, "src/app/api/admin/resolve-profile/route.ts"),
  "utf8",
);

assert.match(panelSrc, /resolveAdminProfileLink/);
assert.match(panelSrc, /\/api\/admin\/resolve-profile/);
assert.match(panelSrc, /ProfileLink uid=\{receptorUid\}/);
assert.match(panelSrc, /ProfileLink uid=\{verifiedUid\}/);
assert.doesNotMatch(panelSrc, /ipHash|blockedIpHash|infer.*ip/i);

// blockedByUid shown as raw uid (blocker profile) — must not be IP-derived label.
assert.match(panelSrc, /Quién bloqueó:/);

assert.match(resolveRouteSrc, /verifyAdminIdToken/);
assert.match(panelSrc, /cache: "no-store"/);
assert.match(resolveRouteSrc, /Cache-Control.*no-store/);

const negativeControls = [
  !/hashAbuseClientIp/.test(panelSrc),
  !/getTrustedRequestClientIp/.test(panelSrc),
  !panelSrc.includes("blockedIpHash"),
];

assert.ok(negativeControls.every(Boolean), "panel must not infer identity from IP hash");

console.log(
  JSON.stringify(
    {
      gate: "P0_ADMIN_ANTiacoso_WHO_LINKS",
      pass: true,
      technical: "static_contract",
      physical: "PENDING_admin_session_with_real_uids",
      negativeControls: [
        "no_ip_hash_in_panel",
        "no_trusted_ip_helpers_in_panel",
        "no_blockedIpHash_display",
      ],
    },
    null,
    2,
  ),
);
