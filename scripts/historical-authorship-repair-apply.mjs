/**
 * CLI must not mass-apply. Use /admin/authorship with explicit selections.
 */
console.error("REFUSED: use admin UI /admin/authorship. CLI never mass-applies. writes=0");
process.exit(2);
