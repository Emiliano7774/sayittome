import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";
const p = join(root, "src/components/modern/ModernPublicProfile.tsx");
let s = readFileSync(p, "utf8");

s = s.replace(
  /border-white\/15/g,
  "border-white",
);
s = s.replace("text-violet-300/85", "text-white/40");
s = s.replace(
  `className="absolute right-4 top-4 rounded-full border border-green-400/30 bg-black/55 px-3 py-1 text-xs font-black text-green-300">
                En línea`,
  `className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-black/60 px-3 py-1 text-xs font-black text-green-300">
                <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,.9)]" />
                En línea`,
);

writeFileSync(p, s, "utf8");
console.log("patched profile");
