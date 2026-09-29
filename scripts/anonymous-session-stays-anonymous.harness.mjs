/**
 * ANONYMOUS_SESSION_STAYS_ANONYMOUS
 * Anonymous Firebase sessions must never be forced to /register* from Settings
 * keep-alive, cache flash, emailVerified checks, or focus refresh.
 *
 *   node --experimental-strip-types scripts/anonymous-session-stays-anonymous.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const disposition = await import(
  pathToFileURL(path.join(root, "src/lib/auth/settingsAuthDisposition.ts")).href
);

const settingsSrc = fs.readFileSync(
  path.join(root, "src/app/settings/page.tsx"),
  "utf8",
);
const authCtxSrc = fs.readFileSync(
  path.join(root, "src/contexts/AuthContext.tsx"),
  "utf8",
);
const gateSrc = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileEntryGate.tsx"),
  "utf8",
);
const classicEditSrc = fs.readFileSync(
  path.join(root, "src/app/settings/edit/components/ClassicEditProfilePage.tsx"),
  "utf8",
);
const modernEditSrc = fs.readFileSync(
  path.join(root, "src/app/settings/edit/components/ModernEditProfilePage.tsx"),
  "utf8",
);
const anonMatchSrc = fs.readFileSync(
  path.join(root, "src/contexts/AnonMatchContext.tsx"),
  "utf8",
);

const anonUser = { uid: "anonUid1", isAnonymous: true, emailVerified: false };
const registeredUnverified = {
  uid: "reg1",
  isAnonymous: false,
  emailVerified: false,
};
const registeredVerified = {
  uid: "reg2",
  isAnonymous: false,
  emailVerified: true,
};

// 1. anonymous => anon gate, never verify-email redirect
{
  const d = disposition.resolveSettingsAuthDisposition({
    authReady: true,
    user: anonUser,
    settingsRouteActive: true,
  });
  assert.equal(d.kind, "anon_gate");
  assert.notEqual(d.kind, "redirect");
}

// 2. anonymous => loadProfile must NOT be selected
{
  const d = disposition.resolveSettingsAuthDisposition({
    authReady: true,
    user: anonUser,
    settingsRouteActive: true,
  });
  assert.notEqual(d.kind, "load_profile");
  assert.equal(
    disposition.shouldLoadSettingsProfileOnFocus({
      authUser: anonUser,
      settingsRouteActive: true,
    }),
    false,
  );
}

// 3. anonymous => cached registered profile ignored
{
  const cached = disposition.readTrustedSettingsProfileCache(
    {
      uid: "regOwner",
      profile: { uid: "regOwner", username: "ownerflash" },
    },
    anonUser,
  );
  assert.equal(cached, null);

  const nullUser = disposition.readTrustedSettingsProfileCache(
    {
      uid: "regOwner",
      profile: { uid: "regOwner", username: "ownerflash" },
    },
    null,
  );
  assert.equal(nullUser, null);
}

// 4. ownerUid for anonymous empty
{
  assert.equal(
    disposition.resolveSettingsOwnerUid({
      profileUid: "anonUid1",
      authUser: anonUser,
    }),
    "",
  );
  assert.equal(
    disposition.resolveSettingsOwnerUid({
      profileUid: null,
      authUser: anonUser,
    }),
    "",
  );
}

// 5. Settings hidden on public main tabs => no auth redirect
for (const _tab of ["/shuffle", "/stories", "/chats", "/boost"]) {
  const d = disposition.resolveSettingsAuthDisposition({
    authReady: true,
    user: registeredUnverified,
    settingsRouteActive: false,
  });
  assert.equal(d.kind, "registered_hidden");
  assert.equal(
    disposition.shouldAllowSettingsAccountRedirect({
      settingsRouteActive: false,
      path: "/register/verify-email",
    }),
    false,
  );
}

// 6. focus while anonymous => no profile read / no redirect
{
  assert.equal(
    disposition.shouldLoadSettingsProfileOnFocus({
      authUser: anonUser,
      settingsRouteActive: true,
    }),
    false,
  );
  assert.equal(
    disposition.shouldLoadSettingsProfileOnFocus({
      authUser: anonUser,
      settingsRouteActive: false,
    }),
    false,
  );
}

// 7. registered unverified + active /settings => verify-email redirect
{
  const d = disposition.resolveSettingsAuthDisposition({
    authReady: true,
    user: registeredUnverified,
    settingsRouteActive: true,
  });
  assert.deepEqual(d, {
    kind: "redirect",
    path: "/register/verify-email",
  });
}

// 8. registered incomplete redirect path still allowed when Settings active
{
  assert.equal(
    disposition.shouldAllowSettingsAccountRedirect({
      settingsRouteActive: true,
      path: "/register/setup",
    }),
    true,
  );
  assert.equal(
    disposition.shouldAllowSettingsAccountRedirect({
      settingsRouteActive: true,
      path: "/register/verify-email",
    }),
    true,
  );
}

// 9. registered complete + active /settings => profile load
{
  const d = disposition.resolveSettingsAuthDisposition({
    authReady: true,
    user: registeredVerified,
    settingsRouteActive: true,
  });
  assert.deepEqual(d, { kind: "load_profile", uid: "reg2" });
  assert.equal(
    disposition.shouldLoadSettingsProfileOnFocus({
      authUser: registeredVerified,
      settingsRouteActive: true,
    }),
    true,
  );
  const trusted = disposition.readTrustedSettingsProfileCache(
    {
      uid: "reg2",
      profile: { uid: "reg2", username: "ok" },
    },
    registeredVerified,
  );
  assert.equal(trusted?.username, "ok");
}

// 10. registered incomplete + hidden settings => no redirect; active => redirect
{
  const hidden = disposition.resolveSettingsAuthDisposition({
    authReady: true,
    user: registeredUnverified,
    settingsRouteActive: false,
  });
  assert.equal(hidden.kind, "registered_hidden");
  const active = disposition.resolveSettingsAuthDisposition({
    authReady: true,
    user: registeredUnverified,
    settingsRouteActive: true,
  });
  assert.equal(active.kind, "redirect");
  assert.equal(active.path, "/register/verify-email");
}

// 11. AuthContext anonymous profile null if adopted
{
  assert.match(authCtxSrc, /if \(user\.isAnonymous\)/);
  assert.match(
    authCtxSrc,
    /Anonymous Firebase auth is not a registered profile/,
  );
  const anonIdx = authCtxSrc.indexOf("if (user.isAnonymous)");
  assert.ok(anonIdx >= 0);
  const afterAnon = authCtxSrc.slice(anonIdx, anonIdx + 450);
  assert.match(afterAnon, /setProfile\(null\)/);
  assert.match(afterAnon, /setLoading\(false\)/);
  assert.match(afterAnon, /return;/);
  assert.doesNotMatch(afterAnon, /getDoc\(/);
  // getDoc for profile only after anonymous early-return
  const getDocIdx = authCtxSrc.indexOf("getDoc(doc(db, \"usuarios\"", anonIdx);
  assert.ok(getDocIdx > anonIdx);
  assert.ok(authCtxSrc.indexOf("return;", anonIdx) < getDocIdx);
}

// 12. no change to anonymous matching/chat identity semantics
{
  assert.match(anonMatchSrc, /firebaseUser/);
  assert.match(anonMatchSrc, /firebaseUser\?\.isAnonymous/);
  assert.doesNotMatch(
    anonMatchSrc,
    /profile\.profileSetupComplete/,
  );
}

// Source wiring: Settings must use disposition + main-tab pathname + uid cache
{
  assert.match(settingsSrc, /resolveSettingsAuthDisposition/);
  assert.match(settingsSrc, /getCurrentMainTabPathname/);
  assert.match(settingsSrc, /settingsRouteActive/);
  assert.match(settingsSrc, /readTrustedSettingsProfileCache/);
  assert.match(settingsSrc, /clearSettingsProfileCache/);
  assert.match(settingsSrc, /sayittome:settings-self-profile:v2/);
  assert.match(settingsSrc, /ProfileEntryGate/);
  assert.match(settingsSrc, /shouldLoadSettingsProfileOnFocus/);
  assert.match(settingsSrc, /shouldAllowSettingsAccountRedirect/);
  assert.match(settingsSrc, /resolveSettingsOwnerUid/);
  // Must not treat emailVerified alone for any Firebase user without isAnonymous guard path
  assert.doesNotMatch(
    settingsSrc,
    /if \(!user\.emailVerified\) \{\s*router\.replace\("\/register\/verify-email"\)/,
  );
  // loadProfile must reject anonymous
  assert.match(settingsSrc, /user\.isAnonymous/);
  assert.match(settingsSrc, /if \(!user\?\.uid \|\| user\.isAnonymous\) return;/);
}

// Gate: voluntary CTAs only, no edit link, no auto-navigate
{
  assert.match(gateSrc, /href="\/register"/);
  assert.match(gateSrc, /href="\/login"/);
  assert.match(gateSrc, /href="\/shuffle"/);
  assert.doesNotMatch(gateSrc, /\/settings\/edit/);
  assert.doesNotMatch(gateSrc, /router\.(replace|push)/);
}

// Edit pages: anonymous treated as account-only login gate on explicit route
{
  assert.match(classicEditSrc, /user\.isAnonymous/);
  assert.match(modernEditSrc, /u\.isAnonymous/);
  assert.match(classicEditSrc, /router\.replace\("\/login"\)/);
  assert.match(modernEditSrc, /router\.replace\("\/login"\)/);
}

console.log("PASS anonymous-session-stays-anonymous");
