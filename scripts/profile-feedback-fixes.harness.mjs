/**
 * Verification email language, profile media persist, and solid shuffle nav.
 *   node scripts/profile-feedback-fixes.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const email = fs.readFileSync(path.join(root, "src/lib/auth/authEmailLanguage.ts"), "utf8");
assert.match(email, /auth\.languageCode/);
assert.match(email, /es: "es"/);

for (const file of [
  "src/components/register/ModernRegisterPage.tsx",
  "src/components/register/ClassicRegisterPage.tsx",
  "src/app/register/verify-email/page.tsx",
]) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  assert.match(src, /applyAuthEmailLanguage/);
}

const modernEdit = fs.readFileSync(
  path.join(root, "src/app/settings/edit/components/ModernEditProfilePage.tsx"),
  "utf8",
);
const classicEdit = fs.readFileSync(
  path.join(root, "src/app/settings/edit/components/ClassicEditProfilePage.tsx"),
  "utf8",
);
assert.match(modernEdit, /hydratedUidRef/);
assert.match(classicEdit, /hydratedUidRef/);
assert.match(modernEdit, /persistUploadedProfileMedia/);
assert.match(classicEdit, /persistUploadedProfileMedia/);
assert.match(modernEdit, /mapWithConcurrency/);

const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
assert.match(css, /\.sayittome-bottom-nav\.sayittome-glass-bar/);
assert.match(css, /rgba\(8, 8, 12, 0\.94\)/);

const messages = fs.readFileSync(path.join(root, "src/lib/i18n/messages.ts"), "utf8");
assert.match(messages, /spam y promociones/);

console.log("PASS profile-feedback-fixes");
