/** Shared Web Push eligibility. Permission must come from a user gesture;
 * granted sessions self-heal regardless of profile Settings access. */
export function shouldAutoReconcileWebPush(input: {
  uid: string;
  native: boolean;
  permission: string;
  messagesEnabled: boolean;
  arrivalsEnabled: boolean;
}): boolean {
  return Boolean(input.uid) && !input.native && input.permission === "granted" &&
    (input.messagesEnabled || input.arrivalsEnabled);
}
