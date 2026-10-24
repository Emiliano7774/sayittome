#!/usr/bin/env node
/**
 * Production PASS ABSOLUTO lock — web notification delivery (Android + desktop).
 * Pinned to the owner-tested source snapshot. No Firebase/network calls.
 * A changed protected file fails build / pre-commit / CI until intentionally
 * revalidated, sealed and reviewed. Normalize CRLF to permit Windows dev.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const manifestFile = new URL("./notification-pass-lock.json", import.meta.url);
const approvedPaths = [
  "public/chat-notify/sw.js",
  "src/lib/chat/fcmPush.ts",
  "src/lib/chat/chatNotifications.ts",
  "src/lib/chat/webNotificationDelivery.ts",
  "src/lib/chat/fcmEnablePipeline.ts",
  "src/lib/chat/fcmRegistrationStore.ts",
  "src/lib/chat/webPushAutoPolicy.ts",
  "src/lib/chat/webPushTokenRecovery.ts",
  "src/lib/chat/webPushSwTelemetry.ts",
  "src/lib/chat/webForegroundPushPolicy.ts",
  "src/lib/chat/anonArrivalPrefs.ts",
  "src/components/anonMatch/AnonArrivalToast.tsx",
  "src/hooks/useGlobalChatAlerts.ts",
  "src/components/app/NativeAppBootstrap.tsx",
  "functions/src/anonArrivalPush.ts",
];
const banner = [
  "",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "!!!  ALTO: NOTIFICACIONES WEB BLINDADAS — PASS ABSOLUTO DEL USUARIO    !!!",
  "!!!  ANDROID WEB + PC WEB: ENTREGA REAL CONFIRMADA, NO TOCAR A CIEGAS  !!!",
  "!!!  CAMBIO BLOQUEADO: ANTES DE MODIFICAR, REVALIDAR AMBAS PLATAFORMAS  !!!",
  "!!!  NO ANULAR ESTE CONTROL NI DESACTIVAR LAS NOTIFICACIONES EXISTENTES!!!",
  "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
  "",
].join("\n");
const checksum = value => createHash("sha256")
  .update(String(value).replace(/\r\n/g, "\n"), "utf8")
  .digest("hex");
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const args = new Set(process.argv.slice(2));
const sealing = args.has("--seal");
const checkingIndex = args.has("--staged");
if (sealing) {
  if (process.env.STM_NOTIFICATIONS_PASS_REVALIDATED !== "ANDROID_WEB_AND_PC_WEB") {
    console.error(banner, "RECHAZADO: necesita verificación real en Android Web y PC Web, y aprobación explícita del responsable.");
    process.exit(1);
  }
  const files = Object.fromEntries(approvedPaths.map(path => [path, checksum(read(path))]));
  const manifest = {
    locked: "PASS_ABSOLUTO",
    scope: "Android Web + PC Web: notificaciones entrantes y de reconexion",
    approval: "Confirmación explícita del responsable, 2026-10-23 (America/Argentina/Cordoba)",
    lastKnownProductionBuiltAt: "2026-10-24T00:43:00.399Z",
    revalidatedAt: new Date().toISOString(),
    files,
  };
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("SNAPSHOT SELLADO: " + approvedPaths.length + " archivos críticos. Guardar el manifiesto junto al código.");
  process.exit(0);
}
let manifest;
try { manifest = JSON.parse(readFileSync(manifestFile, "utf8")); }
catch (error) {
  console.error(banner, "No existe o es ilegible el sello de PASS ABSOLUTO.", String(error));
  process.exit(1);
}
if (manifest.locked !== "PASS_ABSOLUTO" ||
    Object.keys(manifest.files || {}).length !== approvedPaths.length ||
    approvedPaths.some(path => !manifest.files[path])) {
  console.error(banner, "Sello incompleto o alterado; producción BLOQUEADA.");
  process.exit(1);
}
const changed = [];
for (const path of approvedPaths) {
  let actual;
  try {
    if (checkingIndex) actual = checksum(execFileSync("git", ["show", ":" + path], {encoding: "utf8", maxBuffer: 8*1024*1024}));
    else actual = checksum(read(path));
  } catch {
    changed.push(path + " (archivo faltante)");
    continue;
  }
  if (manifest.files[path] !== actual) changed.push(path);
}
if (changed.length) {
  console.error(banner);
  console.error("ARCHIVOS DEL SISTEMA DE NOTIFICACIONES MODIFICADOS:");
  changed.forEach(path => console.error("  ! " + path));
  console.error("\nSE PROHIBE COMPILAR/COMMIT/DEPLOY SIN REVALIDACION EXPRESA.");
  console.error("Antes de actualizar el sello: comprobar notificaciones reales en Android Web y PC Web,");
  console.error("con pestaña activa, minimizada y al reingresar, además de pruebas antirregresión.");
  console.error("Documento: NOTIFICACIONES-PASS-ABSOLUTO.md");
  process.exit(1);
}
console.log("[NOTIFICACIONES PASS ABSOLUTO] Sello intacto: Android Web + PC Web (" + approvedPaths.length + " archivos).");
