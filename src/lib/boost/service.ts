import { createHash } from "crypto";

import {
  BOOST_MIN_MINUTES,
  BOOST_MINUTES_PER_ACTIVATION,
  BOOST_MINUTES_PER_REFERRAL,
  MAX_ACTIVE_BOOSTS_QUERY,
  MAX_REFERRALS_PER_DAY,
  REFERRAL_ACTIVE_WINDOW_MS,
  REFERRAL_QUALIFY_DELAY_MS,
} from "@/lib/boost/constants";
import { isDisposableEmail } from "@/lib/boost/disposableEmailDomains";
import { generateReferralCode } from "@/lib/boost/referralCode";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import {
  createFirestoreDoc,
  getFirestoreDoc,
  patchFirestoreDoc,
  runCollectionQuery,
} from "@/lib/firestore/rest";

export type BoostStatus = {
  boostCreditsMinutes: number;
  referralCode: string;
  referralLink: string;
  activeBoostUntil: number | null;
  referralsQualified: number;
  referralsPending: number;
};

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function parseMs(value: unknown) {
  if (!value) return 0;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? 0 : ms;
}

function isProfileActive(row: Record<string, unknown>, now = Date.now()) {
  if (row.banned === true) return false;
  const username = String(row.username || row.nombre || "").trim();
  if (!username) return false;

  const lastActive = String(
    row.lastActiveAt || row.presenceAt || row.lastSeenAt || row.lastActive || "",
  );

  if (isShuffleProfileOnline({ presenceAt: lastActive, lastActive }, now, ONLINE_WINDOW_MS)) {
    return true;
  }

  const lastMs = parseMs(lastActive);
  if (!lastMs) return false;

  return now - lastMs <= REFERRAL_ACTIVE_WINDOW_MS;
}

export async function ensureUserReferralCode(uid: string) {
  const user = await getFirestoreDoc("usuarios", uid);
  if (!user) return null;

  const existing = String(user.referralCode || "").trim();
  if (existing) return existing;

  let code = generateReferralCode(uid);
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await getFirestoreDoc("referral_codes", code);
    if (!taken) break;
    code = generateReferralCode(`${uid}:${attempt}`);
  }

  await patchFirestoreDoc("usuarios", uid, { referralCode: code });
  await patchFirestoreDoc("referral_codes", code, { uid, referralCode: code });
  return code;
}

export async function findReferrerByCode(code: string) {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  const mapping = await getFirestoreDoc("referral_codes", normalized);
  if (!mapping?.uid) return null;

  return getFirestoreDoc("usuarios", String(mapping.uid));
}

export async function trackReferralSignup(input: {
  inviteeUid: string;
  referralCode: string;
  inviteeEmail?: string;
  visitorId?: string;
}) {
  const inviteeUid = String(input.inviteeUid || "").trim();
  const referralCode = String(input.referralCode || "").trim().toLowerCase();

  if (!inviteeUid || !referralCode) {
    return { ok: false as const, reason: "missing_fields" as const };
  }

  const existing = await getFirestoreDoc("referrals", inviteeUid);
  if (existing) {
    return { ok: true as const, alreadyTracked: true as const };
  }

  const referrer = await findReferrerByCode(referralCode);
  if (!referrer) {
    return { ok: false as const, reason: "invalid_code" as const };
  }

  const referrerUid = String(referrer.uid || referrer.id || "");
  if (!referrerUid || referrerUid === inviteeUid) {
    return { ok: false as const, reason: "self_referral" as const };
  }

  const email = String(input.inviteeEmail || "").trim().toLowerCase();
  if (email && isDisposableEmail(email)) {
    return { ok: false as const, reason: "disposable_email" as const };
  }

  const inviteeVisitorId = String(input.visitorId || "").trim();
  const referrerVisitorId = String(referrer.deviceVisitorId || "").trim();
  if (inviteeVisitorId && referrerVisitorId && inviteeVisitorId === referrerVisitorId) {
    return { ok: false as const, reason: "same_device" as const };
  }

  const now = Date.now();
  const eligibleAt = new Date(now + REFERRAL_QUALIFY_DELAY_MS).toISOString();

  await createFirestoreDoc(
    "referrals",
    {
      inviteeUid,
      referrerUid,
      referralCode,
      status: "pending",
      createdAt: new Date(now).toISOString(),
      eligibleAt,
      inviteeEmailHash: email ? hashValue(email) : "",
      inviteeVisitorId,
    },
    inviteeUid,
  );

  if (inviteeVisitorId) {
    await patchFirestoreDoc("usuarios", inviteeUid, {
      deviceVisitorId: inviteeVisitorId,
    });
  }

  return { ok: true as const, alreadyTracked: false as const };
}

async function countReferralsQualifiedToday(referrerUid: string) {
  const rows = await runCollectionQuery("referrals", 200, "createdAt", "DESCENDING");
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return rows.filter((row) => {
    if (String(row.referrerUid) !== referrerUid) return false;
    if (String(row.status) !== "qualified") return false;
    const qualifiedAt = parseMs(row.qualifiedAt);
    return qualifiedAt >= startOfDay.getTime();
  }).length;
}

export async function processPendingReferrals(referrerUid: string) {
  const rows = await runCollectionQuery("referrals", 200, "createdAt", "DESCENDING");
  const now = Date.now();
  let awarded = 0;

  const pendingForReferrer = rows.filter(
    (row) =>
      String(row.referrerUid) === referrerUid && String(row.status) === "pending",
  );

  for (const row of pendingForReferrer) {
    const eligibleAt = parseMs(row.eligibleAt);
    if (!eligibleAt || eligibleAt > now) continue;

    const inviteeUid = String(row.inviteeUid || row.id || "");
    if (!inviteeUid) continue;

    const invitee = await getFirestoreDoc("usuarios", inviteeUid);
    if (!invitee || !isProfileActive(invitee, now)) {
      await patchFirestoreDoc("referrals", inviteeUid, {
        status: "rejected",
        rejectReason: "invitee_inactive",
        resolvedAt: new Date(now).toISOString(),
      });
      continue;
    }

    const referrer = await getFirestoreDoc("usuarios", referrerUid);
    const inviteeVisitor = String(row.inviteeVisitorId || invitee.deviceVisitorId || "");
    const referrerVisitor = String(referrer?.deviceVisitorId || "");
    if (inviteeVisitor && referrerVisitor && inviteeVisitor === referrerVisitor) {
      await patchFirestoreDoc("referrals", inviteeUid, {
        status: "rejected",
        rejectReason: "same_device",
        resolvedAt: new Date(now).toISOString(),
      });
      continue;
    }

    const qualifiedToday = await countReferralsQualifiedToday(referrerUid);
    if (qualifiedToday >= MAX_REFERRALS_PER_DAY) break;

    const currentCredits = Number(referrer?.boostCreditsMinutes || 0);
    await patchFirestoreDoc("usuarios", referrerUid, {
      boostCreditsMinutes: currentCredits + BOOST_MINUTES_PER_REFERRAL,
      referralsQualifiedCount: Number(referrer?.referralsQualifiedCount || 0) + 1,
    });

    await patchFirestoreDoc("referrals", inviteeUid, {
      status: "qualified",
      qualifiedAt: new Date(now).toISOString(),
      minutesAwarded: BOOST_MINUTES_PER_REFERRAL,
    });

    awarded += 1;
  }

  return awarded;
}

export async function getBoostStatus(uid: string, siteOrigin: string): Promise<BoostStatus | null> {
  if (!uid) return null;

  await processPendingReferrals(uid);

  const user = await getFirestoreDoc("usuarios", uid);
  if (!user || !isPublicProfile(user)) return null;

  const referralCode = (await ensureUserReferralCode(uid)) || "";
  const boostDoc = await getFirestoreDoc("shuffle_boosts", uid);
  const expiresAt = parseMs(boostDoc?.expiresAt);
  const active = boostDoc?.active === true && expiresAt > Date.now();

  const referrals = await runCollectionQuery("referrals", 200, "createdAt", "DESCENDING");
  const mine = referrals.filter((row) => String(row.referrerUid) === uid);

  return {
    boostCreditsMinutes: Number(user.boostCreditsMinutes || 0),
    referralCode,
    referralLink: `${siteOrigin}/register?ref=${encodeURIComponent(referralCode)}`,
    activeBoostUntil: active ? expiresAt : null,
    referralsQualified: mine.filter((row) => row.status === "qualified").length,
    referralsPending: mine.filter((row) => row.status === "pending").length,
  };
}

export async function activateBoost(uid: string, minutesRequested?: number) {
  const user = await getFirestoreDoc("usuarios", uid);
  if (!user || !isPublicProfile(user)) {
    return { ok: false as const, reason: "no_profile" as const };
  }

  const credits = Number(user.boostCreditsMinutes || 0);
  const minutes = Math.floor(Number(minutesRequested ?? BOOST_MINUTES_PER_ACTIVATION));

  if (!Number.isFinite(minutes) || minutes < BOOST_MIN_MINUTES) {
    return { ok: false as const, reason: "invalid_minutes" as const };
  }

  if (credits < minutes) {
    return { ok: false as const, reason: "insufficient_credits" as const };
  }

  const existing = await getFirestoreDoc("shuffle_boosts", uid);
  const existingExpires = parseMs(existing?.expiresAt);
  if (existing?.active === true && existingExpires > Date.now()) {
    return { ok: false as const, reason: "already_active" as const };
  }

  const now = Date.now();
  const expiresAt = new Date(now + minutes * 60_000).toISOString();
  const username = String(user.username || user.nombre || "");

  await patchFirestoreDoc("usuarios", uid, {
    boostCreditsMinutes: credits - minutes,
  });

  await patchFirestoreDoc("shuffle_boosts", uid, {
    uid,
    username,
    active: true,
    activatedAt: new Date(now).toISOString(),
    expiresAt,
  });

  invalidateActiveBoostCache();

  return {
    ok: true as const,
    expiresAt: Date.parse(expiresAt),
    minutesUsed: minutes,
  };
}

let cachedActiveBoosts: { rows: Record<string, unknown>[]; fetchedAt: number } | null = null;
const ACTIVE_BOOST_CACHE_MS = 30_000;

export async function getActiveBoostProfiles(now = Date.now()) {
  if (cachedActiveBoosts && now - cachedActiveBoosts.fetchedAt < ACTIVE_BOOST_CACHE_MS) {
    return cachedActiveBoosts.rows.filter((row) => parseMs(row.expiresAt) > now);
  }

  const rows = await runCollectionQuery(
    "shuffle_boosts",
    MAX_ACTIVE_BOOSTS_QUERY,
    "activatedAt",
    "ASCENDING",
  );

  const active = rows.filter((row) => row.active === true && parseMs(row.expiresAt) > now);
  cachedActiveBoosts = { rows: active, fetchedAt: now };
  return active;
}

export function invalidateActiveBoostCache() {
  cachedActiveBoosts = null;
}
