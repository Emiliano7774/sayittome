/**
 * Re-export CJS materializer for ESM harnesses/tools.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const {
  materializeNextHashedExternals,
  listHashedExternals,
  discoverHashedExternals,
  assertHashedExternalsResolved,
  materializeAndAssert,
} = require("./materialize-next-hashed-externals.cjs");
