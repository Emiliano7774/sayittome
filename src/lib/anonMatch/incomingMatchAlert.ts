"use client";

import {
  dismissRequiredAnonMatchNotification,
  showRequiredAnonMatchNotification,
} from "@/lib/chat/chatNotifications";
import { playIncomingWhipSound } from "@/lib/chat/whipSound";

export function alertIncomingAnonMatchRequest(requestId: string) {
  const id = String(requestId || "").trim();
  if (!id) return;

  playIncomingWhipSound();
  try {
    navigator.vibrate?.([180, 80, 180]);
  } catch {
    // Vibration is best effort and may be disabled by Android/browser policy.
  }

  void showRequiredAnonMatchNotification({
    requestId: id,
    title: "Encontramos un chat",
    body: "Hay una persona disponible. Aceptá la solicitud para empezar.",
  });
}

export function dismissIncomingAnonMatchRequestAlert(requestId: string) {
  void dismissRequiredAnonMatchNotification(requestId);
}
