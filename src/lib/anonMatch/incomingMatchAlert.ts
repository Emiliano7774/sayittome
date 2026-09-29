"use client";

import {
  dismissRequiredAnonMatchNotification,
  showRequiredAnonMatchNotification,
} from "@/lib/chat/chatNotifications";
import { playIncomingWhipSound } from "@/lib/chat/whipSound";

/** Recipient: solicitud pendiente — modal + whip + OS banner when permitted. */
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

/**
 * Either side: chat accepted and the floating tab opens.
 * Covers the searcher on phone/PC when the other party accepts, and the
 * acceptor when the compact chat window mounts.
 */
export function alertAnonMatchChatOpened(chatId: string) {
  const id = String(chatId || "").trim();
  if (!id) return;

  playIncomingWhipSound();
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    // Best effort.
  }

  void showRequiredAnonMatchNotification({
    requestId: `chat_${id}`,
    title: "Se encontró un chat",
    body: "Tu chat anónimo ya está abierto. Tocá para volver a la app.",
  });
}

export function dismissIncomingAnonMatchRequestAlert(requestId: string) {
  void dismissRequiredAnonMatchNotification(requestId);
}

export function dismissAnonMatchChatOpenedAlert(chatId: string) {
  const id = String(chatId || "").trim();
  if (!id) return;
  void dismissRequiredAnonMatchNotification(`chat_${id}`);
}
