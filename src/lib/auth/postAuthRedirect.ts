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
    profileSetupComplete?: boolean;
  };

  const username = String(data.username || data.nombre || "").trim();
  const provincia = String(data.provincia || "").trim();

  if (!username || !provincia || data.profileSetupComplete !== true) {
    return "/register/setup";
  }

  return "/settings";
}
