import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export async function assertProfileOwner(username: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user?.uid) return false;

  try {
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (!snap.exists()) return false;

    const data = snap.data() as {
      username?: string;
      usernameLower?: string;
      nombre?: string;
    };

    const mine = String(data.usernameLower || data.username || data.nombre || "")
      .trim()
      .toLowerCase();

    return mine === username.trim().toLowerCase();
  } catch {
    return false;
  }
}
