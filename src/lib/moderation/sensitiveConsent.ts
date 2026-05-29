"use client";

const memory = new Set<string>();

export function mediaConsentKey(url: string) {
  return url.trim();
}

export function hasSensitiveConsent(mediaKey: string) {
  if (!mediaKey) return false;
  return memory.has(mediaKey);
}

export function grantSensitiveConsent(mediaKey: string) {
  if (!mediaKey) return;
  memory.add(mediaKey);
}

export function revokeAllSensitiveConsent() {
  memory.clear();
}

export function shouldShowSensitiveBlur(mediaKey: string, requiresBlur: boolean) {
  if (!requiresBlur) return false;
  return !hasSensitiveConsent(mediaKey);
}
