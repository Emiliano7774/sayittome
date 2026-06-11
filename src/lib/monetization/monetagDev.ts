const DEV = process.env.NODE_ENV === "development";

export function logMonetag(event: string, detail?: Record<string, unknown>) {
  if (!DEV) return;
  console.info(`[Monetag] ${event}`, detail ?? "");
}

export function reportMonetagDevState(label: string, detail: Record<string, unknown>) {
  if (!DEV) return;
  logMonetag(label, detail);
}
