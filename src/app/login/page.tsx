"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";

import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { mapLoginErrorCode } from "@/lib/auth/registerErrors";
import PublicLegalFooter from "@/components/legal/PublicLegalFooter";
import { auth } from "@/lib/firebase";
import { useT } from "@/contexts/LocaleContext";
import {
  readQaAuthDiagnosticState,
  recordQaCriticalEvent,
  setQaAuthDiagnosticState,
} from "@/lib/qa/realDeviceQaDebug";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setQaAuthDiagnosticState({
        authCurrentUserUid: user?.uid || null,
        authReady: true,
        authDomain: auth.app.options.authDomain || null,
        currentHost: window.location.host,
      });
      recordQaCriticalEvent("auth", "AUTH_STATE_CHANGED", {
        authenticated: Boolean(user),
      });
      if (!user) {
        setChecking(false);
        return;
      }

      const next = await resolvePostAuthPath(user.uid, user.emailVerified);
      router.replace(next);
    });

    return () => unsub();
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);
    const previous = readQaAuthDiagnosticState();
    const authClickCount = Number(previous.authClickCount || 0) + 1;
    setQaAuthDiagnosticState({
      authClickCount,
      authLastAction: "email-password-submit",
      authLastErrorCode: null,
      authLastErrorMessage: null,
      popupAttempted: false,
      redirectAttempted: false,
      authDomain: auth.app.options.authDomain || null,
      currentHost: window.location.host,
    });
    recordQaCriticalEvent("auth", "AUTH_LOGIN_SUBMIT", { authClickCount });

    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password,
      );

      const next = await resolvePostAuthPath(
        cred.user.uid,
        cred.user.emailVerified,
      );
      setQaAuthDiagnosticState({
        authLastAction: "email-password-success",
        authCurrentUserUid: cred.user.uid,
        authReady: true,
      });
      recordQaCriticalEvent("auth", "AUTH_LOGIN_SUCCESS", {
        next,
      });
      router.replace(next);
    } catch (err: unknown) {
      const code = String((err as { code?: string })?.code || "");
      const message = String((err as { message?: string })?.message || "Unknown auth error");
      setError(t(mapLoginErrorCode(code)));
      setQaAuthDiagnosticState({
        authLastAction: "email-password-error",
        authLastErrorCode: code || "unknown",
        authLastErrorMessage: message,
        authReady: true,
      });
      recordQaCriticalEvent("auth", "AUTH_LOGIN_ERROR", {
        code: code || "unknown",
        message,
      });
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-2xl font-black">{t("auth_detecting_session")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-[32px] border border-white/10 bg-zinc-950/80 p-8 shadow-[0_0_80px_rgba(139,92,246,.18)]"
      >
        <h1 className="text-3xl font-black mb-3">{t("auth_login_title")}</h1>

        <p className="text-white/55 mb-8">{t("auth_login_subtitle")}</p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          placeholder={t("auth_email")}
          className="w-full h-14 rounded-2xl bg-white text-black px-4 mb-4 outline-none"
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder={t("auth_password")}
          className="w-full h-14 rounded-2xl bg-black border border-white/10 text-white px-4 mb-4 outline-none"
        />

        {error && <p className="text-red-400 font-semibold mb-4">{error}</p>}

        <button
          disabled={loading}
          className="w-full h-14 rounded-full bg-violet-500 font-black text-white disabled:opacity-50"
        >
          {loading ? t("auth_entering") : t("auth_enter")}
        </button>

        <p className="mt-6 text-center text-sm text-white/55">
          {t("auth_no_account")}{" "}
          <Link href="/register" className="text-violet-300">
            {t("auth_register_link")}
          </Link>
        </p>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-full mt-6 text-violet-300"
        >
          {t("common_back_home")}
        </button>

        <PublicLegalFooter className="mt-8 border-t-0 pt-0" />
      </form>
    </main>
  );
}
