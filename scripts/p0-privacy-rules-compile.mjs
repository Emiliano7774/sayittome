/**
 * Compile gate for draft privacy rules — must pass before emulator matrix.
 */
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");

const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = Number(process.env.P0_PRIVACY_EMULATOR_PORT || 8080);

async function probeEmulator(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

if (!(await probeEmulator(EMULATOR_HOST, EMULATOR_PORT))) {
  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_RULES_COMPILE",
      pass: false,
      error: "emulator_not_reachable_for_compile",
    }),
  );
  process.exit(2);
}

try {
  const env = await initializeTestEnvironment({
    projectId: "demo-p0-privacy-compile-gate",
    firestore: { rules, host: EMULATOR_HOST, port: EMULATOR_PORT },
  });
  await env.cleanup();
  console.log(JSON.stringify({ gate: "P0_PRIVACY_RULES_COMPILE", pass: true }));
} catch (error) {
  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_RULES_COMPILE",
      pass: false,
      error: String(error?.message || error),
    }),
  );
  process.exit(1);
}
