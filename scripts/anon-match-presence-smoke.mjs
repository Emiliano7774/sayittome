/**
 * Safe production smoke: anon alias bind → presence under same alias → available sees it → DELETE.
 * Never prints tokens. Uses Firebase anonymous Auth + Hosting APIs only.
 *
 *   node scripts/anon-match-presence-smoke.mjs
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut } from "firebase/auth";

const HOST = process.env.ADMIN_SMOKE_HOST || "https://sayittome-app.web.app";
const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const app = initializeApp(firebaseConfig, `presence-smoke-${Date.now()}`);
const auth = getAuth(app);

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ gate: "ANON_MATCH_PRESENCE_SMOKE", pass: false, reason, ...extra }));
  process.exit(1);
}

async function main() {
  const cred = await signInAnonymously(auth);
  const user = cred.user;
  if (!user?.isAnonymous) fail("not_anonymous");
  const idToken = await user.getIdToken();
  const headers = {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };

  const bindRes = await fetch(`${HOST}/api/anon-match/bind-alias`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const bindJson = await bindRes.json().catch(() => ({}));
  if (!bindRes.ok || !bindJson?.ok || !bindJson?.anonId) {
    fail("bind_alias_failed", { status: bindRes.status, error: bindJson?.error || null });
  }
  const alias = String(bindJson.anonId);

  const postRes = await fetch(`${HOST}/api/anonymous-presence`, {
    method: "POST",
    headers,
    body: JSON.stringify({ anonId: alias }),
    cache: "no-store",
  });
  const postJson = await postRes.json().catch(() => ({}));
  if (!postRes.ok || !postJson?.ok) {
    fail("presence_post_failed", { status: postRes.status, error: postJson?.error || null });
  }
  if (String(postJson.anonId) !== alias) {
    fail("presence_alias_mismatch", {
      boundAliasLen: alias.length,
      presenceAnonIdLen: String(postJson.anonId || "").length,
      same: false,
    });
  }

  // Spoof attempt must be denied.
  const spoofRes = await fetch(`${HOST}/api/anonymous-presence`, {
    method: "POST",
    headers,
    body: JSON.stringify({ anonId: `anon_spoof_${Date.now().toString(36)}` }),
    cache: "no-store",
  });
  const spoofJson = await spoofRes.json().catch(() => ({}));
  if (spoofRes.status !== 403 || spoofJson?.ok) {
    fail("spoof_not_denied", { status: spoofRes.status, error: spoofJson?.error || null });
  }

  const availRes = await fetch(`${HOST}/api/anon-match/request`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const availJson = await availRes.json().catch(() => ({}));
  if (!availRes.ok || availJson?.ok === false) {
    fail("available_failed", { status: availRes.status, error: availJson?.error || null });
  }

  const delRes = await fetch(`${HOST}/api/anonymous-presence`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ anonId: alias }),
    cache: "no-store",
  });
  const delJson = await delRes.json().catch(() => ({}));
  if (!delRes.ok || !delJson?.ok) {
    fail("presence_delete_failed", { status: delRes.status, error: delJson?.error || null });
  }

  await signOut(auth).catch(() => null);

  console.log(
    JSON.stringify({
      gate: "ANON_MATCH_PRESENCE_SMOKE",
      pass: true,
      host: HOST,
      aliasLen: alias.length,
      presenceAnonIdMatchesBind: true,
      spoofDenied: true,
      available: Number(availJson?.available ?? -1),
      cleaned: true,
    }),
  );
}

main().catch((error) => {
  fail(String(error?.message || error));
});
