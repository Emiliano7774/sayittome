import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

const root = "c:/Users/emibe/sayittome-web";

const restores = [
  ["fb29472", "src/components/modern/ModernHome.tsx"],
  ["92b58d1", "src/components/modern/ModernPublicProfile.tsx"],
  ["92b58d1", "src/components/modern/ModernShuffleCard.tsx"],
];

for (const [commit, rel] of restores) {
  const data = execSync(`git -C "${root}" show ${commit}:${rel}`, { encoding: "buffer" });
  writeFileSync(join(root, rel), data);
  console.log("restored", rel, "bytes", data.length, "starts", data.subarray(0, 15).toString("utf8"));
}
