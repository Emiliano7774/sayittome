/**
 * Static audit for the two-step chat back flow.
 * Run: node scripts/audit-chat-back.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = [
  "src/lib/navigation/chatBackNavigation.ts",
  "src/lib/navigation/nativeBack.ts",
  "src/lib/navigation/handleNativeBack.ts",
  "src/lib/navigation/fastNavigate.ts",
];

const requiredSnippets = [
  ["chatBackNavigation.ts", "keyboard-dismissed"],
  ["chatBackNavigation.ts", "recordPathBeforeChatOpen"],
  ["nativeBack.ts", "resolveChatBackAction"],
  ["handleNativeBack.ts", "dismissChatKeyboard"],
  ["fastNavigate.ts", "recordPathBeforeChatOpen"],
];

let failed = false;

for (const file of files) {
  const path = join(root, file);
  try {
    readFileSync(path, "utf8");
    console.log(`ok  ${file}`);
  } catch {
    console.error(`missing ${file}`);
    failed = true;
  }
}

for (const [label, snippet] of requiredSnippets) {
  const path = join(root, "src/lib/navigation", label.includes(".ts") ? label : files.find((f) => f.includes(label.split(".")[0])) || "");
  const content = readFileSync(join(root, "src/lib/navigation", label), "utf8");
  if (!content.includes(snippet)) {
    console.error(`missing snippet "${snippet}" in ${label}`);
    failed = true;
  } else {
    console.log(`ok  ${label} contains ${snippet}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("chat back audit passed");
