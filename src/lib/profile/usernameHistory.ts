import { normalizeUsername } from "@/lib/profile/username";

export function normalizeUsernameHistoryEntry(username: string) {
  return normalizeUsername(username).toLowerCase();
}

/** Returns the prior username to store when a rename happens. */
export function previousUsernameToRemember(
  previousUsername: string,
  nextUsername: string,
) {
  const previous = normalizeUsernameHistoryEntry(previousUsername);
  const next = normalizeUsernameHistoryEntry(nextUsername);

  if (!previous || !next || previous === next) return null;
  return previous;
}

export class ProfileUsernameChangedError extends Error {
  readonly code = "username_changed" as const;
  readonly requestedUsername: string;
  readonly currentUsername: string;

  constructor(requestedUsername: string, currentUsername: string) {
    super("username_changed");
    this.name = "ProfileUsernameChangedError";
    this.requestedUsername = requestedUsername;
    this.currentUsername = currentUsername;
  }
}

export function isProfileUsernameChangedError(
  error: unknown,
): error is ProfileUsernameChangedError {
  return error instanceof ProfileUsernameChangedError;
}
