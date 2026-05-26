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

export default function ClassicRegisterPage() {
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
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6 font-[Arial,Helvetica,sans-serif] tracking-[-0.015em]">
        <header className="mb-9 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-300 via-violet-500 to-[#4f35ff]" />
            <p className="text-base font-medium tracking-[-0.02em] text-zinc-100">SayItToMe</p>
          </div>

          <HeaderControls />
        </header>

        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-[2.7rem] border border-violet-400/10 bg-[#030303] p-8 shadow-[0_0_80px_rgba(104,76,255,0.24)]"
        >
          <h1 className="text-3xl font-medium tracking-[-0.05em]">{t("auth_register_title")}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{t("auth_register_subtitle")}</p>

          <div className="mt-8 space-y-4">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder={t("auth_email")}
              className="w-full h-16 rounded-full border border-white/15 bg-black px-5 text-white outline-none placeholder:text-zinc-500"
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder={t("auth_password")}
              className="w-full h-16 rounded-full border border-white/15 bg-black px-5 text-white outline-none placeholder:text-zinc-500"
            />

            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder={t("auth_confirm_password")}
              className="w-full h-16 rounded-full border border-white/15 bg-black px-5 text-white outline-none placeholder:text-zinc-500"
            />
          </div>

          {error && <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-8 flex h-20 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#5f58ff] to-[#7256ff] text-[15px] font-medium tracking-[-0.02em] shadow-[0_0_45px_rgba(105,82,255,0.48)] disabled:opacity-50"
          >
            {loading ? t("auth_registering") : t("auth_register_submit")}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-zinc-400">
          {t("auth_has_account")}{" "}
          <Link href="/login" className="text-violet-300">
            {t("auth_login_link")}
          </Link>
        </p>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-4 text-center text-sm text-zinc-500"
        >
          {t("common_back_home")}
        </button>
      </section>
    </main>
  );
}
