"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  sendEmailVerification,
  type User,
} from "firebase/auth";

import HeaderControls from "@/components/HeaderControls";
import { logoutAndResetAnon } from "@/lib/auth/logout";
import { resolvePostAuthPath } from "@/lib/auth/postAuthRedirect";
import { auth } from "@/lib/firebase";
import { useT } from "@/contexts/LocaleContext";

export default function VerifyEmailPage() {
  const router = useRouter();
  const t = useT();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/register");
        return;
      }

      if (currentUser.emailVerified) {
        const next = await resolvePostAuthPath(currentUser.uid, true);
        router.replace(next);
        return;
      }

      setUser(currentUser);
      setChecking(false);
    });

    return () => unsub();
  }, [router]);

  async function handleVerified() {
    if (!user) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await user.reload();
      const refreshed = auth.currentUser;

      if (!refreshed?.emailVerified) {
        setError(t("auth_verify_not_yet"));
        return;
      }

      const next = await resolvePostAuthPath(refreshed.uid, true);
      router.replace(next);
    } catch {
      setError(t("auth_verify_check_fail"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!user) return;

    setResending(true);
    setError("");
    setMessage("");

    try {
      await sendEmailVerification(user, {
        url: `${window.location.origin}/register/verify-email`,
        handleCodeInApp: false,
      });
      setMessage(t("auth_verify_resent"));
    } catch {
      setError(t("auth_verify_resend_fail"));
    } finally {
      setResending(false);
    }
  }

  async function handleSignOut() {
    await logoutAndResetAnon();
    router.replace("/register");
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-2xl font-black">{t("auth_verify_checking_session")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6">
        <header className="mb-9 flex items-center justify-between">
          <p className="text-base font-medium text-zinc-100">{t("auth_verify_title")}</p>
          <HeaderControls />
        </header>

        <div className="rounded-[2.7rem] border border-violet-400/10 bg-[#030303] p-8 shadow-[0_0_80px_rgba(104,76,255,0.24)]">
          <h1 className="text-3xl font-medium tracking-[-0.05em]">{t("auth_verify_title")}</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            {t("auth_verify_body", { email: user?.email || "" })}
          </p>

          {message && <p className="mt-4 text-sm font-semibold text-emerald-400">{message}</p>}
          {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleVerified}
            disabled={loading}
            className="mt-8 flex h-20 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#5f58ff] to-[#7256ff] text-[15px] font-medium disabled:opacity-50"
          >
            {loading ? t("auth_verify_checking") : t("auth_verify_check")}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="mt-4 flex h-16 w-full items-center justify-center rounded-full border border-white/15 text-sm disabled:opacity-50"
          >
            {resending ? t("auth_verify_resending") : t("auth_verify_resend")}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-6 w-full text-sm text-zinc-500"
          >
            {t("auth_verify_other_email")}
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-zinc-400">
          {t("auth_has_account")}{" "}
          <Link href="/login" className="text-violet-300">
            {t("auth_login_link")}
          </Link>
        </p>
      </section>
    </main>
  );
}
