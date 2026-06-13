import { doc, getDoc, getDocFromServer } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { isValidUsername, normalizeUsername } from "@/lib/profile/username";

type UserDoc = {
  username?: string;
  nombre?: string;
  usernameLower?: string;
  provincia?: string;
  bio?: string;
  descripcion?: string;
  fotoPrincipal?: string;
  photoURL?: string;
  fotos?: unknown;
  perfilCompleto?: boolean;
  profileSetupComplete?: boolean;
};

async function loadUserDoc(uid: string) {
  const ref = doc(db, "usuarios", uid);

  try {
    const cached = await getDoc(ref);
    if (cached.exists()) return cached;
  } catch {
    // fall through to server
  }

  try {
    return await getDocFromServer(ref);
  } catch {
    return getDoc(ref);
  }
}

export function isRegisteredProfileComplete(data: UserDoc) {
  const username = normalizeUsername(String(data.username || data.nombre || ""));
  if (!username || !isValidUsername(username)) return false;

  if (data.profileSetupComplete === true || data.perfilCompleto === true) {
    return true;
  }

  if (String(data.provincia || "").trim()) return true;
  if (Boolean(data.fotoPrincipal || data.photoURL)) return true;
  if (String(data.bio || data.descripcion || "").trim()) return true;

  const fotos = Array.isArray(data.fotos) ? data.fotos : [];
  if (fotos.length > 0) return true;

  const usernameLower = String(data.usernameLower || "")
    .trim()
    .toLowerCase();
  if (usernameLower && usernameLower === username.toLowerCase()) {
    return true;
  }

  return false;
}

export async function resolvePostAuthPath(
  uid: string,
  emailVerified: boolean,
): Promise<string> {
  if (!emailVerified) return "/register/verify-email";

  const snap = await loadUserDoc(uid);
  if (!snap.exists()) return "/register/setup";

  const data = snap.data() as UserDoc;

  if (!isRegisteredProfileComplete(data)) {
    return "/register/setup";
  }

  return "/settings";
}
