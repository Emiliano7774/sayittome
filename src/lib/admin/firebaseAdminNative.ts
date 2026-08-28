/**
 * Server-only Firebase Admin SDK loader that Turbopack cannot rewrite into
 * hashed externals (firebase-admin-<hash>). Static ESM/CJS Admin package
 * imports are rewritten; this module builds the specifier at runtime and
 * loads via Node createRequire / Function require.
 */
import "server-only";

import { createRequire } from "node:module";
import { join } from "node:path";

type NodeRequireLike = (id: string) => unknown;

function opaqueAdminRoot(): string {
  // Intentionally fragmented — must never appear as a single static "firebase-admin" literal.
  const parts = ["fire", "base", String.fromCharCode(45), "admin"];
  return parts.join("");
}

function nativeRequire(): NodeRequireLike {
  try {
    return createRequire(join(process.cwd(), "package.json")) as NodeRequireLike;
  } catch {
    // Fallback for unusual runtimes; still opaque to static bundlers.
    // eslint-disable-next-line no-new-func -- intentional anti-bundler escape hatch
    return Function("return require")() as NodeRequireLike;
  }
}

function loadAdminSubpath(subpath: string): unknown {
  const root = opaqueAdminRoot();
  const id = subpath ? `${root}/${subpath}` : root;
  return nativeRequire()(id);
}

export type FirebaseAdminAppModule = {
  applicationDefault: (...args: never[]) => unknown;
  cert: (serviceAccount: unknown) => unknown;
  getApp: (name?: string) => { name: string; options?: { projectId?: string } };
  getApps: () => Array<{ name: string; options?: { projectId?: string } }>;
  initializeApp: (options?: unknown, name?: string) => unknown;
};

export type FirebaseAdminAuthModule = {
  getAuth: (app?: unknown) => {
    verifyIdToken: (token: string, checkRevoked?: boolean) => Promise<{
      email?: string;
      uid?: string;
      email_verified?: boolean;
    }>;
  };
};

export type FirebaseAdminFirestoreModule = {
  getFirestore: (app?: unknown) => unknown;
  FieldValue: {
    serverTimestamp: () => unknown;
    delete: () => unknown;
  };
  FieldPath: {
    documentId: () => unknown;
  };
};

export function loadFirebaseAdminApp(): FirebaseAdminAppModule {
  return loadAdminSubpath("app") as FirebaseAdminAppModule;
}

export function loadFirebaseAdminAuth(): FirebaseAdminAuthModule {
  return loadAdminSubpath("auth") as FirebaseAdminAuthModule;
}

export function loadFirebaseAdminFirestore(): FirebaseAdminFirestoreModule {
  return loadAdminSubpath("firestore") as FirebaseAdminFirestoreModule;
}
