import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_NAV_TRACE: "1" },
  shell: true,
});

process.exit(result.status ?? 1);
