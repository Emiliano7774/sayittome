import { analyzeIpTrustHeaders } from "@/lib/abuse/abuseIpTrustProbeAnalyze";
import {
  buildSpoofHeadersForScenario,
  compareIpTrustFingerprints,
  isProbeHttpSuccess,
  P0_IP_TRUST_PROBE_TIMEOUT_MS,
  resolveDirectSsrBaseUrl,
  type IpTrustHeaderAnalysis,
  type IpTrustProbeScenario,
} from "@/lib/abuse/abuseIpTrustProbeShared";
import { adminPrivateJson, adminPrivatePreflight } from "@/lib/admin/adminPrivateApi";
import {
  mapP0DiagStrictRouteError,
  verifyAdminIdTokenStrictForP0Diag,
} from "@/lib/admin/verifyAdminP0DiagStrict";

export const dynamic = "force-dynamic";

const SCENARIOS: IpTrustProbeScenario[] = [
  "baseline",
  "spoof_xff_left_public",
  "spoof_xff_client_only",
  "spoof_x_real_ip",
  "spoof_forwarded",
];

function isScenario(value: string): value is IpTrustProbeScenario {
  return (SCENARIOS as string[]).includes(value);
}

type EchoJson = {
  ok?: boolean;
  analysis?: IpTrustHeaderAnalysis;
  error?: string;
};

async function fetchDirectEcho(authorization: string, extraHeaders: Record<string, string>) {
  const url = `${resolveDirectSsrBaseUrl()}/api/admin/p0-ip-trust-echo`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), P0_IP_TRUST_PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        ...extraHeaders,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as EchoJson | null;
    const httpOk = isProbeHttpSuccess(res.status);
    const analysis = json?.analysis || null;
    const ok = httpOk && json?.ok === true && Boolean(analysis);
    return {
      ok,
      httpStatus: res.status,
      analysis,
      error: ok ? null : String(json?.error || `http_${res.status}`),
      timedOut: false,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      httpStatus: timedOut ? 408 : 0,
      analysis: null,
      error: timedOut ? "probe_timeout" : String((error as Error)?.message || error),
      timedOut,
    };
  } finally {
    clearTimeout(timer);
  }
}

function wrapServerScenario(
  scenario: IpTrustProbeScenario,
  direct: Awaited<ReturnType<typeof fetchDirectEcho>>,
  baseline: IpTrustHeaderAnalysis | null,
) {
  return {
    path: "serverToDirectSsr" as const,
    scenario,
    ok: direct.ok,
    httpStatus: direct.httpStatus,
    analysis: direct.analysis,
    error: direct.error,
    timedOut: direct.timedOut,
    compare:
      baseline && direct.analysis && scenario !== "baseline"
        ? compareIpTrustFingerprints(baseline, direct.analysis)
        : null,
  };
}

export async function OPTIONS(req: Request) {
  return adminPrivatePreflight(req);
}

export async function POST(req: Request) {
  try {
    await verifyAdminIdTokenStrictForP0Diag(req);
  } catch (error) {
    const mapped = mapP0DiagStrictRouteError(error);
    return adminPrivateJson(req, mapped.body, mapped.status);
  }

  const authorization = String(req.headers.get("authorization") || "").trim();
  if (!authorization) {
    return adminPrivateJson(req, { ok: false, error: "missing_authorization" }, 401);
  }

  let body: { scenario?: string; runAll?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const hostingAnalysis = analyzeIpTrustHeaders(req);

  if (body.runAll) {
    const results: Record<string, unknown> = {};
    let serverBaseline: IpTrustHeaderAnalysis | null = null;

    for (const scenario of SCENARIOS) {
      const spoof = buildSpoofHeadersForScenario(scenario);
      const direct = await fetchDirectEcho(authorization, spoof);
      if (scenario === "baseline" && direct.analysis) {
        serverBaseline = direct.analysis;
      }
      results[scenario] = wrapServerScenario(scenario, direct, serverBaseline);
    }

    const allOk = Object.values(results).every((row) => (row as { ok?: boolean }).ok === true);

    return adminPrivateJson(req, {
      ok: allOk,
      gate: "P0_IP_TRUST_PROBE",
      pathNote:
        "serverToDirectSsr measures SSR egress IP — compare with browserToDirectSsr from Admin UI",
      hostingPath: hostingAnalysis,
      directSsrBase: resolveDirectSsrBaseUrl(),
      results,
      activateGates: false,
    });
  }

  const scenario = isScenario(String(body.scenario || ""))
    ? (body.scenario as IpTrustProbeScenario)
    : "baseline";
  const spoof = buildSpoofHeadersForScenario(scenario);
  const direct = await fetchDirectEcho(authorization, spoof);

  const baselineDirect =
    scenario === "baseline"
      ? direct
      : await fetchDirectEcho(authorization, {});

  const serverBaseline = baselineDirect.analysis;
  const wrapped = wrapServerScenario(scenario, direct, serverBaseline);

  return adminPrivateJson(req, {
    ok: wrapped.ok,
    gate: "P0_IP_TRUST_PROBE",
    pathNote:
      "serverToDirectSsr measures SSR egress IP — use browserToDirectSsr in Admin UI for client path",
    scenario,
    hostingPath: hostingAnalysis,
    directSsrBase: resolveDirectSsrBaseUrl(),
    serverProbe: wrapped,
    activateGates: false,
  });
}
