/**
 * Whether /login should auto-leave the form for an already-authenticated user.
 * Anonymous Firebase sessions must stay on the form so email/password can replace them.
 */
export function shouldAutoRedirectFromLogin(
  user: { isAnonymous?: boolean } | null | undefined,
): boolean {
  return Boolean(user && user.isAnonymous !== true);
}
