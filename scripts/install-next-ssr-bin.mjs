/**
 * Install node_modules/.bin/next (+ .cmd) shim that forces webpack + materializes
 * hashed Turbopack server externals after `next build` (Firebase ignores npm postbuild).
 *
 * On Windows Firebase uses cross-spawn on `.bin/next`, which resolves to `.cmd`.
 * Also write a Node entry as `.bin/next` so non-cross-spawn callers work.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const binDir = join(root, "node_modules", ".bin");
const shimJs = join(root, "scripts", "bin-next", "next");

if (!existsSync(shimJs)) {
  throw new Error(`missing next shim at ${shimJs}`);
}
if (!existsSync(binDir)) {
  mkdirSync(binDir, { recursive: true });
}

// Portable Node launcher (works when spawned without PATHEXT/.cmd).
// From node_modules/.bin → ../../scripts/bin-next/next
const nodeWrapper = `#!/usr/bin/env node
require("../../scripts/bin-next/next");
`;

const unixWrapper = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node "$basedir/../../scripts/bin-next/next" "$@"
`;

const cmdWrapper = `@ECHO off\r
SETLOCAL\r
SET "NODE_EXE=node"\r
IF EXIST "%~dp0\\node.exe" SET "NODE_EXE=%~dp0\\node.exe"\r
"%NODE_EXE%" "%~dp0\\..\\..\\scripts\\bin-next\\next" %*\r
`;

const psWrapper = `#!/usr/bin/env pwsh
$basedir = Split-Path $MyInvocation.MyCommand.Definition -Parent
& node "$basedir/../../scripts/bin-next/next" @args
exit $LASTEXITCODE
`;

writeFileSync(join(binDir, "next"), nodeWrapper.replace(/\r\n/g, "\n"), "utf8");
writeFileSync(join(binDir, "next.cmd"), cmdWrapper, "utf8");
writeFileSync(join(binDir, "next.ps1"), psWrapper.replace(/\r\n/g, "\n"), "utf8");
// Keep a unix-style copy name for environments that expect the shell shim path.
writeFileSync(join(binDir, "next-unix"), unixWrapper.replace(/\r\n/g, "\n"), "utf8");
try {
  chmodSync(join(binDir, "next"), 0o755);
  chmodSync(join(binDir, "next-unix"), 0o755);
} catch {
  /* windows */
}

console.log("[install-next-ssr-bin] installed node_modules/.bin/next SSR materialize+webpack shim");
