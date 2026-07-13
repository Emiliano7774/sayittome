import fs from "node:fs";
import { spawn } from "node:child_process";

const logPath = "scripts/ghost-filmstrip-out/_prod-hop-wrapper.log";
fs.mkdirSync("scripts/ghost-filmstrip-out", { recursive: true });
fs.writeFileSync(logPath, `start ${new Date().toISOString()}\n`);

// Explicitly refuse TLS verification bypass for this prod hop process tree.
// Production runtime must never depend on NODE_TLS_REJECT_UNAUTHORIZED=0.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  fs.appendFileSync(logPath, "cleared NODE_TLS_REJECT_UNAUTHORIZED=0 from env\n");
}

// Local-only: Avast Web/Mail Shield MITM breaks Firebase CLI TLS unless its CA is trusted.
// Prefer NODE_EXTRA_CA_CERTS (proper trust) over reject-unauthorized bypass.
const AVAST_CA = "C:\\ProgramData\\AVAST Software\\Avast\\wscert.pem";
const env = { ...process.env };
delete env.NODE_TLS_REJECT_UNAUTHORIZED;
if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(AVAST_CA)) {
  env.NODE_EXTRA_CA_CERTS = AVAST_CA;
  fs.appendFileSync(
    logPath,
    "NODE_EXTRA_CA_CERTS set to Avast Web/Mail Shield CA for local Firebase CLI only\n",
  );
}
fs.appendFileSync(
  logPath,
  `NODE_TLS_REJECT_UNAUTHORIZED=${env.NODE_TLS_REJECT_UNAUTHORIZED ?? "(unset)"}\nNODE_EXTRA_CA_CERTS=${env.NODE_EXTRA_CA_CERTS ?? "(unset)"}\n`,
);

const child = spawn(process.execPath, ["scripts/prod-single-hop-verified-true-delivery.mjs"], {
  cwd: process.cwd(),
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

function append(chunk, stream) {
  const text = chunk.toString();
  fs.appendFileSync(logPath, text);
  if (stream === "out") process.stdout.write(text);
  else process.stderr.write(text);
}

child.stdout.on("data", (c) => append(c, "out"));
child.stderr.on("data", (c) => append(c, "err"));

child.on("exit", (code, signal) => {
  fs.appendFileSync(
    logPath,
    `\nexit code=${code} signal=${signal} at ${new Date().toISOString()}\n`,
  );
  process.exit(code ?? 1);
});
