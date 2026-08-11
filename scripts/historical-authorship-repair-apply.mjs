/**
 * CLI apply/rollback for historical authorship. Frozen until ChatGPT audit.
 * Usage: node scripts/historical-authorship-repair-apply.mjs --dry-run
 */
const args = process.argv.slice(2);
if (args.includes("--apply") || args.includes("--rollback")) {
  console.error("REFUSED: APPLY_FROZEN_PENDING_CHATGPT_AUDIT. writes=0");
  process.exit(2);
}

console.log(
  JSON.stringify(
    {
      gate: "HISTORICAL_REPAIR_CLI",
      applyAllowed: false,
      writes: 0,
      note: "Use admin /admin/authorship preview + export without PII.",
    },
    null,
    2,
  ),
);
