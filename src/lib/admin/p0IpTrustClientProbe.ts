import {
  buildSpoofHeadersForScenario,
  isProbeHttpSuccess,
  P0_IP_TRUST_PROBE_TIMEOUT_MS,
  resolveDirectSsrBaseUrl,
  type IpTrustHeaderAnalysis,
  type IpTrustProbeScenario,
} from "@/lib/abuse/abuseIpTrustProbeShared";
import { auth } from "@/lib/firebase";

export type ClientDirectEchoProbeResult = {
  ok: boolean;
  path: "browserToDirectSsr";
  scenario: IpTrustProbeScenario;
  httpStatus: number;
  analysis: IpTrustHeaderAnalysis | null;
  error: string | null;
  timedOut: boolean;
};

async function getAdminIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("sin_auth_admin");
  return user.getIdToken();
}

export async function runClientDirectEchoProbe(
  scenario: IpTrustProbeScenario,
): Promise<ClientDirectEchoProbeResult> {
  const url = `${resolveDirectSsrBaseUrl()}/api/admin/p0-ip-trust-echo`;
  const spoof = buildSpoofHeadersForScenario(scenario);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), P0_IP_TRUST_PROBE_TIMEOUT_MS);

  try {
    const idToken = await getAdminIdToken();
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: "application/json",
        ...spoof,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      analysis?: IpTrustHeaderAnalysis;
      error?: string;
    } | null;

    const analysis = json?.analysis || null;
    const httpOk = isProbeHttpSuccess(res.status);
    const ok = httpOk && json?.ok === true && Boolean(analysis);

    return {
      ok,
      path: "browserToDirectSsr",
      scenario,
      httpStatus: res.status,
      analysis,
      error: ok ? null : String(json?.error || `http_${res.status}`),
      timedOut: false,
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      path: "browserToDirectSsr",
      scenario,
      httpStatus: timedOut ? 408 : 0,
      analysis: null,
      error: timedOut ? "probe_timeout" : String((error as Error)?.message || error),
      timedOut,
    };
  } finally {
    window.clearTimeout(timer);
  }
}
