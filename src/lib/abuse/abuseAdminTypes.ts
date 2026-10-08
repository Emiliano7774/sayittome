/**
 * Minimal Admin Firestore transaction typing (getRepairAdminDb is opaque `any`).
 * Avoids TS7006 without pulling firebase-admin types into every caller.
 */
export type AbuseAdminTx = {
  get: (ref: unknown) => Promise<{
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
    id?: string;
    ref?: unknown;
  }>;
  set: (ref: unknown, data: Record<string, unknown>, options?: { merge?: boolean }) => void;
  create: (ref: unknown, data: Record<string, unknown>) => void;
};

export type AbuseAdminQueryDoc = {
  id: string;
  ref: unknown;
  data: () => Record<string, unknown>;
};
