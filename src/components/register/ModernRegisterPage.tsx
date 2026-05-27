"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";

import HeaderControls from "@/components/HeaderControls";
import { auth } from "@/lib/firebase";
import { beginFreshAnonSession } from "@/lib/chat/anonSession";
import { mapRegisterErrorCode } from "@/lib/auth/registerErrors";
import { useT } from "@/contexts/LocaleContext";

export default function ModernRegisterPage() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError(t("error_register_email_required"));
      return;
    }

    if (!password) {
      setError(t("error_register_password_required"));
      return;
    }

    if (password.length < 6) {
      setError(t("error_register_weak_password"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("error_register_password_mismatch"));
      return;
    }

    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

      await sendEmailVerification(cred.user, {
        url: `${window.location.origin}/register/verify-email`,
        handleCodeInApp: false,
      });

      beginFreshAnonSession();

      router.replace("/register/verify-email");
    } catch (err: unknown) {
      const code = String((err as { code?: string })?.code || "");
      setError(t(mapRegisterErrorCode(code)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-fuchsia-300">
              SAYITTOME
            </p>
            <h1 className="mt-3 text-3xl font-semibold">{t("auth_register_title")}</h1>
          </div>

          <HeaderControls />
        </header>

        <div className="flex flex-1 items-center justify-center py-16">
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-fuchsia-500/20 bg-zinc-950 p-8 shadow-2xl shadow-fuchsia-950/40"
          >
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-fuchsia-500/15 blur-3xl" />

            <p className="text-sm leading-7 text-zinc-400">{t("auth_register_subtitle")}</p>

            <div className="mt-8 space-y-4">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder={t("auth_email")}
                className="w-full rounded-2xl bg-white px-4 py-4 text-black outline-none"
              />

              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder={t("auth_password")}
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
              />

              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder={t("auth_confirm_password")}
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
              />
            </div>

            {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full rounded-full bg-white py-4 text-sm font-normal text-black disabled:opacity-50"
            >
              {loading ? t("auth_registering") : t("auth_register_submit")}
            </button>

            <p className="mt-6 text-center text-sm text-zinc-400">
              {t("auth_has_account")}{" "}
              <Link href="/login" className="text-fuchsia-300">
                {t("auth_login_link")}
              </Link>
            </p>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-4 w-full text-sm text-zinc-500"
            >
              {t("common_back_home")}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
