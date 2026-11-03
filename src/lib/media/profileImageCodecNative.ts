/** Server-only native codec loader. Keep the npm alias opaque to Turbopack:
 * static imports are rewritten to name-hash external packages which are not
 * installed by Firebase's framework adapter on Linux.
 */
import "server-only";

import { createRequire } from "node:module";
import { join } from "node:path";
import type sharp from "sharp";

export function loadProfileImageCodec(): typeof sharp {
  const packageName = ["profile", "image", "codec"].join("-");
  const nodeRequire = createRequire(join(process.cwd(), "package.json"));
  return nodeRequire(packageName) as typeof sharp;
}
