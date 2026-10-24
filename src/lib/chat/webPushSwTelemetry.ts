"use client";

export const WEB_PUSH_SW_TELEMETRY_CACHE = "sayittome-chat-notify-state-v1";
export const WEB_PUSH_SW_TELEMETRY_KEY = "/chat-notify/__push-telemetry";

export type WebPushSwTelemetryEntry = {
  t: number;
  kind: string;
  type?: string;
  reason?: string;
  inbox?: string;
  ok?: boolean;
};

export async function readWebPushSwTelemetry(): Promise<WebPushSwTelemetryEntry[]> {
  if (typeof caches === "undefined") return [];
  try {
    const cache = await caches.open(WEB_PUSH_SW_TELEMETRY_CACHE);
    const stored = await cache.match(WEB_PUSH_SW_TELEMETRY_KEY);
    if (!stored) return [];
    const rows = await stored.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && typeof row === "object" && typeof row.t === "number")
      .slice(-12) as WebPushSwTelemetryEntry[];
  } catch {
    return [];
  }
}

export function formatWebPushSwTelemetryLine(entry: WebPushSwTelemetryEntry): string {
  const parts = [entry.kind];
  if (entry.type) parts.push(entry.type);
  if (entry.reason) parts.push(entry.reason);
  if (entry.inbox) parts.push(entry.inbox);
  if (typeof entry.ok === "boolean") parts.push(entry.ok ? "ok" : "fail");
  return parts.join(" · ");
}
