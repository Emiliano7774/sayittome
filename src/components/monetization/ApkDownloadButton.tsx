"use client";

import { useState } from "react";

import { useT } from "@/contexts/LocaleContext";

const API_APK_URL = "/api/download/apk";
const STATIC_APK_URL = "/downloads/sayittome.apk";

type Props = {
  className?: string;
  label?: string;
};

async function apkIsAvailable(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export default function ApkDownloadButton({
  className = "",
  label = "Android APK",
}: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    if (busy) return;

    setBusy(true);

    try {
      const apiReady = await apkIsAvailable(API_APK_URL);
      const downloadUrl = apiReady ? API_APK_URL : STATIC_APK_URL;

      if (!apiReady) {
        const staticReady = await apkIsAvailable(STATIC_APK_URL);
        if (!staticReady) {
          window.alert(t("apk_unavailable_server"));
          return;
        }
      }

      const res = await fetch(downloadUrl, { method: "GET", cache: "no-store" });

      if (!res.ok) {
        let message = t("apk_unavailable");

        try {
          const json = await res.json();
          message = String(json?.error || message);
        } catch {
          // ignore
        }

        window.alert(message);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "sayittome.apk";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert(t("apk_download_fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={handleDownload} disabled={busy} className={className}>
      {busy ? t("common_preparing") : label}
    </button>
  );
}
