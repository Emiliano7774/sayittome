import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export async function resolvePostAuthPath(
  uid: string,
  emailVerified: boolean,
): Promise<string> {
  if (!emailVerified) return "/register/verify-email";

  const snap = await getDoc(doc(db, "usuarios", uid));
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

  const username = String(data.username || data.nombre || "").trim();
  const provincia = String(data.provincia || "").trim();
  const hasPrincipalPhoto = Boolean(data.fotoPrincipal || data.photoURL);

  const setupComplete =
    data.profileSetupComplete === true ||
    data.perfilCompleto === true ||
    Boolean(username && provincia && hasPrincipalPhoto);

  if (!username || !provincia || !setupComplete) {
    return "/register/setup";
  }

  return "/settings";
}
