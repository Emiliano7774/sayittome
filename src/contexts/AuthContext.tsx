"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/lib/firebase";
import { withTimeout } from "@/lib/async/withTimeout";
import { writeCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";

type AuthUserData = {
  uid: string;

  username?: string;

  email?: string;

  fotoPrincipal?: string;

  bio?: string;

  provincia?: string;

  profileSetupComplete?: boolean;
};

type AuthContextType = {
  firebaseUser: User | null;

  profile:
    | AuthUserData
    | null;

  loading: boolean;
};

const AuthContext =
  createContext<AuthContextType>({
    firebaseUser: null,
    profile: null,
    loading: true,
  });

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [
    firebaseUser,
    setFirebaseUser,
  ] = useState<User | null>(
    null
  );

  const [profile, setProfile] =
    useState<AuthUserData | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const loadedProfileUidRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsub =
      onAuthStateChanged(
        auth,
        async (user) => {
          setFirebaseUser(user);

          if (!user) {
            loadedProfileUidRef.current = null;
            setProfile(null);
            setLoading(false);
            return;
          }

          const sameUser = loadedProfileUidRef.current === user.uid;
          if (!sameUser) {
            setLoading(true);
          }

          try {
            const snap = await withTimeout(
              getDoc(doc(db, "usuarios", user.uid)),
              8000,
              "auth_profile_timeout",
            );
            if (cancelled || auth.currentUser?.uid !== user.uid) return;

            if (snap.exists()) {
              const data = snap.data();
              if (!user.isAnonymous) {
                writeCachedViewerIdentity(
                  user.uid,
                  String(data.username || data.nombre || ""),
                );
              }

              setProfile({
                uid: user.uid,

                username: data.username || "",

                email: data.email || user.email || "",

                fotoPrincipal: data.fotoPrincipal || "",

                bio: data.bio || "",

                provincia: data.provincia || "",

                profileSetupComplete: data.profileSetupComplete === true,
              });
            } else {
              setProfile({
                uid: user.uid,

                username: "",

                email: user.email || "",

                fotoPrincipal: "",

                bio: "",

                provincia: "",

                profileSetupComplete: false,
              });
            }

            loadedProfileUidRef.current = user.uid;
          } catch (e) {
            console.error(e);
            if (cancelled || auth.currentUser?.uid !== user.uid) return;
            setProfile({
              uid: user.uid,
              username: "",
              email: user.email || "",
              fotoPrincipal: "",
              bio: "",
              provincia: "",
              profileSetupComplete: false,
            });
            loadedProfileUidRef.current = user.uid;
          } finally {
            if (!cancelled) setLoading(false);
          }
        }
      );

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(
    AuthContext
  );
}
