"use client";

import { useState } from "react";

const APK_DOWNLOAD_URL = "/api/download/apk";

type Props = {
  className?: string;
  label?: string;
};

export default function ApkDownloadButton({
  className = "",
  label = "Android APK",
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    if (busy) return;

    setBusy(true);

    try {
      const res = await fetch(APK_DOWNLOAD_URL, { method: "GET" });

      if (!res.ok) {
        let message = "La APK no está disponible todavía.";

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
      window.alert("No se pudo descargar la APK. Probá de nuevo en unos minutos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={handleDownload} disabled={busy} className={className}>
      {busy ? "Preparando..." : label}
    </button>
  );
}
