"use client";

import {
  createContext,
  useContext,
  useEffect,
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

  useEffect(() => {
    const unsub =
      onAuthStateChanged(
        auth,
        async (user) => {
          setLoading(true);

          setFirebaseUser(user);

          if (!user) {
            setProfile(null);

            setLoading(false);

            return;
          }

          try {
            const snap =
              await getDoc(
                doc(
                  db,
                  "usuarios",
                  user.uid
                )
              );

            if (
              snap.exists()
            ) {
              const data =
                snap.data();

              setProfile({
                uid: user.uid,

                username:
                  data.username ||
                  "",

                email:
                  data.email ||
                  user.email ||
                  "",

                fotoPrincipal:
                  data.fotoPrincipal ||
                  "",

                bio:
                  data.bio || "",

                provincia:
                  data.provincia ||
                  "",

                profileSetupComplete:
                  data.profileSetupComplete === true,
              });
            } else {
              setProfile({
                uid: user.uid,

                username:
                  "",

                email:
                  user.email ||
                  "",

                fotoPrincipal:
                  "",

                bio: "",

                provincia:
                  "",

                profileSetupComplete: false,
              });
            }
          } catch (e) {
            console.error(e);
          }

          setLoading(false);
        }
      );

    return () => unsub();
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
