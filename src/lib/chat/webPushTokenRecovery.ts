/** Must match FCM_TOKEN_UNREGISTERED in functions/src/fcmTokenHealth.ts. */
export const FCM_TOKEN_UNREGISTERED = "fcm_token_unregistered";

/** registerFcmToken rejected the token because FCM no longer delivers to it. */
export function isUnregisteredFcmTokenError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null | undefined;
  return String(err?.code || "").endsWith("failed-precondition") &&
    String(err?.message || "").includes(FCM_TOKEN_UNREGISTERED);
}

/**
 * Firebase Messaging returns its cached token for as long as the browser push
 * subscription is unchanged, even after FCM invalidated that token. Dropping
 * the subscription is what makes the next getToken() mint a deliverable token.
 */
export async function resetWebPushSubscription(
  registration: Pick<ServiceWorkerRegistration, "pushManager">,
): Promise<boolean> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}

/** localStorage token without a live PushManager subscription cannot receive background FCM. */
export function webPushLocalCredentialStale(
  hasPersistedToken: boolean,
  hasPushSubscription: boolean,
): boolean {
  return hasPersistedToken && !hasPushSubscription;
}
