import { isValidUsername, normalizeUsername } from "@/lib/profile/username";

export type ProfileValidationIssue =
  | "missing_uid"
  | "missing_username"
  | "invalid_username"
  | "missing_username_lower"
  | "username_lower_mismatch"
  | "missing_provincia"
  | "setup_incomplete"
  | "placeholder_username";

export function getProfileValidationIssues(
  data: Record<string, unknown>,
): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];

  const uid = String(data.uid || data.id || "").trim();
  const username = normalizeUsername(String(data.username || data.nombre || ""));
  const usernameLower = String(data.usernameLower || "").trim().toLowerCase();
  const provincia = String(data.provincia || "").trim();
  const setupComplete = data.profileSetupComplete === true;
  const legacyComplete =
    isValidUsername(username) &&
    !!usernameLower &&
    usernameLower === username.toLowerCase() &&
    !!provincia;

  if (!uid) issues.push("missing_uid");
  if (!username) issues.push("missing_username");
  if (username && !isValidUsername(username)) issues.push("invalid_username");
  if (username.toLowerCase() === "usuario") issues.push("placeholder_username");
  if (!usernameLower) issues.push("missing_username_lower");
  if (username && usernameLower && usernameLower !== username.toLowerCase()) {
    issues.push("username_lower_mismatch");
  }
  if (!provincia) issues.push("missing_provincia");
  if (!setupComplete && !legacyComplete) issues.push("setup_incomplete");

  return issues;
}

export function isPublicProfile(data: Record<string, unknown>) {
  return getProfileValidationIssues(data).length === 0;
}

export function describeProfileValidationIssues(
  issues: ProfileValidationIssue[],
) {
  if (issues.length === 0) return "ok";
  return issues.join(", ");
}
