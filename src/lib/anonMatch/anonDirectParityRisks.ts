/**
 * Scope risks for anon↔anon chat parity (2026-10-09).
 * Expand beyond AnonDirectChatWindow / src/lib/anonMatch/* / new aux+tests
 * only after reviewing these blockers with a dedicated owner.
 */
export const ANON_DIRECT_PARITY_RISKS = [
  {
    id: "viewonce_membership",
    severity: "resolved" as const,
    summary:
      "Bombitas claim/commit PASS for anon-match: isChatMember + isAnonMatchBoundMessageAuthor bind auth.uid to solicitanteAuthUid/destinatarioAuthUid on estado===activo.",
    outOfScopeFiles: [
      "functions/src/deleteChatMessageCore.ts",
      "functions/src/viewOnceClaim.ts",
      "functions/src/viewOnceClaimCore.ts",
    ],
  },
  {
    id: "storage_prefix_chats_anonimos",
    severity: "info" as const,
    summary:
      "Regular media reuses uploadChatMessageMedia → Storage path chats/{chatId}/… (allowed). There is no storage.rules match for chats_anonimos/.",
    outOfScopeFiles: ["storage.rules", "src/lib/media/upload.ts"],
  },
  {
    id: "collection_not_only_chats",
    severity: "info" as const,
    summary:
      "viewOnceClaim resolves both chats and chats_anonimos (CHAT_ROOT_COLLECTIONS). Collection-only FAIL is NOT the blocker; membership was.",
    outOfScopeFiles: ["functions/src/deleteChatMessageCore.ts"],
  },
  {
    id: "inbox_identity_freeze",
    severity: "caution" as const,
    summary:
      "Do not patch identity/inbox/unread or firestore.rules indiscriminately; parallel work owns unread bugs. Black-screen fix must stay untouched.",
    outOfScopeFiles: [
      "firestore.rules",
      "src/lib/anonMatch/anonymousPresenceIdentity.ts",
      "src/hooks/useChats*.ts",
    ],
  },
  {
    id: "fcm_full_notify",
    severity: "defer" as const,
    summary:
      "In-session whip + OS notify for open temp chat is in scope; full FCM/inbox open parity stays out of scope.",
    outOfScopeFiles: ["src/lib/chat/**", "functions/src/**"],
  },
] as const;
