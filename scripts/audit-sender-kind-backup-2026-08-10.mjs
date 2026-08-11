/**
 * Read-only audit of the 2026-08-10 senderKind migration backup.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backup = path.join(root, "scripts", "backups", "chat-sender-kind-2026-08-10T18-09-45-343Z.json");
const payload = JSON.parse(fs.readFileSync(backup, "utf8"));
const rows = payload.rows || [];

const fromShapes = {};
const beforeAfter = {};
let fromUidRewritten = 0;
for (const row of rows) {
  const from = String(row.fromUid || "");
  const shape = from.startsWith("anon_")
    ? "anon"
    : from.startsWith("profile_")
      ? "profile"
      : "other";
  fromShapes[shape] = (fromShapes[shape] || 0) + 1;
  const key = `${row.before ?? "null"}→${row.after}`;
  beforeAfter[key] = (beforeAfter[key] || 0) + 1;
  if (row.previous && Object.prototype.hasOwnProperty.call(row.previous, "fromUid")) {
    fromUidRewritten += 1;
  }
}

console.log(
  JSON.stringify(
    {
      backup: path.basename(backup),
      createdAt: payload.createdAt,
      mode: payload.mode,
      rows: rows.length,
      fromShapes,
      beforeAfter,
      fromUidRewritten,
      conclusion:
        "Migration only filled senderKind from fromUid shape. It did not rewrite authors. Historical invert cannot be fixed by that pass.",
    },
    null,
    2,
  ),
);
