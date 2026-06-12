import { doc, getDoc, getDocFromServer } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { isValidUsername, normalizeUsername } from "@/lib/profile/username";

async function loadUserDoc(uid: string) {
  try {
    return await getDocFromServer(doc(db, "usuarios", uid));
  } catch {
    return getDoc(doc(db, "usuarios", uid));
  }
}

export async function resolvePostAuthPath(
  uid: string,
  emailVerified: boolean,
): Promise<string> {
  if (!emailVerified) return "/register/verify-email";

  const snap = await loadUserDoc(uid);
  if (!snap.exists()) return "/register/setup";

  const data = snap.data() as {
    username?: string;
    nombre?: string;
    provincia?: string;
    fotoPrincipal?: string;
    photoURL?: string;
    perfilCompleto?: boolean;
    profileSetupComplete?: boolean;
  };

  const username = normalizeUsername(String(data.username || data.nombre || ""));
  const provincia = String(data.provincia || "").trim();
  const hasPrincipalPhoto = Boolean(data.fotoPrincipal || data.photoURL);

  if (!username || !isValidUsername(username)) {
    return "/register/setup";
  }

  if (data.profileSetupComplete === true || data.perfilCompleto === true) {
    return "/settings";
  }

  if (provincia || hasPrincipalPhoto) {
    return "/settings";
  }

  return "/register/setup";
}
