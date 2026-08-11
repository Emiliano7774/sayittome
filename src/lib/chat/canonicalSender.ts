import type { User } from "firebase/auth";

import {
  buildCanonicalSender as buildCanonicalSenderCore,
  buildLegacyCanonicalSender,
  isRoleIdentityReady,
  resolveLiveOwnerRole,
  resolveMineFromCanonicalSender,
  type CanonicalSender,
  type CanonicalSenderError,
  type CanonicalSenderRole,
} from "@/lib/chat/authorshipGates";
import { profileAuthUid } from "@/lib/chat/profileAnonMessageAuthor";

export type { CanonicalSender, CanonicalSenderError, CanonicalSenderRole };
export {
  buildLegacyCanonicalSender,
  isRoleIdentityReady,
  resolveLiveOwnerRole,
  resolveMineFromCanonicalSender,
};

export function liveProfileUid(user: User | null | undefined) {
  return profileAuthUid(user);
}

export function buildCanonicalSender(
  input: Parameters<typeof buildCanonicalSenderCore>[0],
) {
  return buildCanonicalSenderCore(input);
}
