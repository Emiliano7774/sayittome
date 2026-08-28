import "server-only";

import {
  loadFirebaseAdminApp,
  loadFirebaseAdminAuth,
  type FirebaseAdminAppModule,
} from "@/lib/admin/firebaseAdminNative";

export const DEFAULT_ADMIN_APP_NAME = "[DEFAULT]";
export const EXPECTED_ADMIN_PROJECT_ID = "sayittome-app";

export type AdminAppHandle = {
  name: string;
  options?: { projectId?: string };
};

export type DefaultAdminAppDeps = {
  getApp: () => AdminAppHandle;
  getApps: () => AdminAppHandle[];
  initializeApp: (options?: unknown, name?: string) => AdminAppHandle;
  applicationDefault: FirebaseAdminAppModule["applicationDefault"];
  cert: FirebaseAdminAppModule["cert"];
};

export type P0DiagSdkInitStage =
  | "admin_app_ready"
  | "admin_app_init_failed"
  | "admin_auth_unavailable";

export type P0DiagSdkInitReport = {
  stage: P0DiagSdkInitStage;
  defaultApp: boolean;
  defaultAppName: string | null;
  namedApps: number;
  projectId: string | null;
  causeCode: string | null;
};

let cachedApp: AdminAppHandle | null = null;
let cachedInit: P0DiagSdkInitReport | null = null;

function readFirebaseErrorCode(error: unknown): string {
  const direct = String((error as { code?: string })?.code || "").trim();
  if (direct) return direct;
  return String((error as { errorInfo?: { code?: string } })?.errorInfo?.code || "").trim();
}

export function sanitizeDefaultAppInitCause(error: unknown): string {
  const code = readFirebaseErrorCode(error);
  if (code) return code;
  const message = String((error as Error)?.message || "").toLowerCase();
  if (message.includes("default firebase app does not exist") || message.includes("no-app")) {
    return "app/no-app";
  }
  if (message.includes("credential") || message.includes("application default")) {
    return "credential/unavailable";
  }
  if (message.includes("project")) return "project/mismatch";
  return "admin_sdk_init_failed";
}

export function countNamedAdminApps(apps: AdminAppHandle[]): number {
  return apps.filter((app) => app.name !== DEFAULT_ADMIN_APP_NAME).length;
}

export function hasDefaultAdminApp(apps: AdminAppHandle[]): boolean {
  return apps.some((app) => app.name === DEFAULT_ADMIN_APP_NAME);
}

export function readDefaultAdminProjectId(app: AdminAppHandle): string {
  return String(app.options?.projectId || "").trim();
}

export function assertDefaultAdminProjectId(app: AdminAppHandle) {
  const projectId = readDefaultAdminProjectId(app);
  if (projectId !== EXPECTED_ADMIN_PROJECT_ID) {
    throw Object.assign(new Error("unavailable"), {
      status: 503,
      causeCode: "project/mismatch",
      projectId,
    });
  }
}

function parseServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
  } catch {
    return null;
  }
}

function resolveRuntimeProjectId(explicit?: string) {
  return String(
    explicit ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.FIREBASE_PROJECT_ID ||
      EXPECTED_ADMIN_PROJECT_ID,
  ).trim();
}

/** Create DEFAULT app only — never reuse or mutate named framework apps. */
export function initializeDefaultAdminApp(deps: DefaultAdminAppDeps): AdminAppHandle {
  const serviceAccount = parseServiceAccount();
  if (serviceAccount?.client_email && serviceAccount.private_key) {
    return deps.initializeApp(
      {
        credential: deps.cert(serviceAccount),
        projectId: resolveRuntimeProjectId(serviceAccount.project_id),
      },
      DEFAULT_ADMIN_APP_NAME,
    );
  }
  return deps.initializeApp(
    {
      credential: deps.applicationDefault(),
      projectId: resolveRuntimeProjectId(),
    },
    DEFAULT_ADMIN_APP_NAME,
  );
}

/**
 * Resolve DEFAULT by name via getApp(), not getApps().length or getApps()[0].
 * Named-only registries (firebase-frameworks) must not block DEFAULT init.
 */
export function resolveDefaultAdminApp(deps: DefaultAdminAppDeps): AdminAppHandle {
  try {
    const existing = deps.getApp();
    if (existing.name !== DEFAULT_ADMIN_APP_NAME) {
      throw Object.assign(new Error("unavailable"), {
        status: 503,
        causeCode: "app/not-default",
      });
    }
    assertDefaultAdminProjectId(existing);
    return existing;
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 503) throw error;
    const created = initializeDefaultAdminApp(deps);
    assertDefaultAdminProjectId(created);
    return created;
  }
}

export function buildDefaultAdminAppDeps(): DefaultAdminAppDeps {
  const { applicationDefault, cert, getApp, getApps, initializeApp } = loadFirebaseAdminApp();
  return {
    getApp: () => getApp() as AdminAppHandle,
    getApps: () => getApps() as AdminAppHandle[],
    initializeApp: (options, name) => initializeApp(options, name) as AdminAppHandle,
    applicationDefault,
    cert,
  };
}

function failInit(stage: P0DiagSdkInitStage, deps: DefaultAdminAppDeps, causeCode: string, projectId: string | null): never {
  const apps = deps.getApps();
  const report: P0DiagSdkInitReport = {
    stage,
    defaultApp: hasDefaultAdminApp(apps),
    defaultAppName: hasDefaultAdminApp(apps) ? DEFAULT_ADMIN_APP_NAME : null,
    namedApps: countNamedAdminApps(apps),
    projectId,
    causeCode,
  };
  cachedInit = report;
  cachedApp = null;
  console.error(
    JSON.stringify({
      gate: "P0_DIAG_ADMIN_SDK_INIT",
      stage: report.stage,
      causeCode: report.causeCode,
      namedApps: report.namedApps,
      defaultApp: report.defaultApp,
    }),
  );
  throw Object.assign(new Error("unavailable"), {
    status: 503,
    initStage: stage,
    causeCode,
  });
}

export function ensureDefaultAdminApp(): AdminAppHandle {
  if (cachedApp) return cachedApp;

  const deps = buildDefaultAdminAppDeps();
  let app: AdminAppHandle;
  try {
    app = resolveDefaultAdminApp(deps);
  } catch (error) {
    const causeCode = sanitizeDefaultAppInitCause(error);
    const apps = deps.getApps();
    const def = apps.find((row) => row.name === DEFAULT_ADMIN_APP_NAME);
    failInit(
      "admin_app_init_failed",
      deps,
      causeCode,
      def ? readDefaultAdminProjectId(def) : null,
    );
  }

  try {
    loadFirebaseAdminAuth().getAuth(app);
  } catch (error) {
    failInit(
      "admin_auth_unavailable",
      deps,
      sanitizeDefaultAppInitCause(error),
      readDefaultAdminProjectId(app) || null,
    );
  }

  cachedApp = app;
  cachedInit = {
    stage: "admin_app_ready",
    defaultApp: true,
    defaultAppName: app.name,
    namedApps: countNamedAdminApps(deps.getApps()),
    projectId: readDefaultAdminProjectId(app) || null,
    causeCode: null,
  };
  return app;
}

export function getDefaultAdminAppInitReport(): P0DiagSdkInitReport | null {
  return cachedInit;
}

/** Harness-only: module cache survives deleteApp() in SDK scenario tests. */
export function resetDefaultAdminAppCacheForHarness() {
  cachedApp = null;
  cachedInit = null;
}
