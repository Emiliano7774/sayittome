import {
  getApp,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

export type AdminAppDeps = {
  getApp: () => App;
  initializeApp: () => App;
};

/**
 * Default app only. Counting every Admin app is wrong when a named instance
 * exists or a duplicate firebase-admin copy owns a different registry.
 */
export function resolveAdminApp(deps: AdminAppDeps): App {
  try {
    return deps.getApp();
  } catch {
    return deps.initializeApp();
  }
}

export function ensureAdminApp(): App {
  return resolveAdminApp({
    getApp: () => getApp(),
    initializeApp: () => initializeApp(),
  });
}

export function db(): Firestore {
  return getFirestore(ensureAdminApp());
}

export function messaging() {
  return getMessaging(ensureAdminApp());
}

export function storage() {
  return getStorage(ensureAdminApp());
}
