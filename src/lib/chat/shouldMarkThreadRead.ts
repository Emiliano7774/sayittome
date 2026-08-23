export type ShouldMarkThreadReadInput = {
  viewerIdentity: string;
  canonicalThreadId: string;
  activeDetailThreadId: string;
  renderedInboundMessageIds: string[];
  latestInboundMessageId: string;
  documentVisibility?: boolean;
};

/**
 * Exact-detail only: mark read after inbound render is confirmed visible.
 */
export function shouldMarkThreadRead({
  viewerIdentity,
  canonicalThreadId,
  activeDetailThreadId,
  renderedInboundMessageIds,
  latestInboundMessageId,
  documentVisibility = true,
}: ShouldMarkThreadReadInput): boolean {
  if (!viewerIdentity || !canonicalThreadId || !latestInboundMessageId) {
    return false;
  }
  if (!documentVisibility) return false;
  if (activeDetailThreadId !== canonicalThreadId) return false;
  if (!renderedInboundMessageIds.includes(latestInboundMessageId)) {
    return false;
  }
  return true;
}

export type DetailReadMarkReason =
  | "ok"
  | "hidden"
  | "not-active"
  | "not-seen"
  | "already"
  | "no-inbound";

export function resolveDetailReadMark(input: {
  viewerIdentity: string;
  canonicalThreadId: string;
  activeDetailThreadId: string;
  renderedInboundMessageIds: string[];
  latestInboundMessageId: string;
  documentVisible: boolean;
  alreadyMarkedKey?: string;
}): { mark: boolean; reason: DetailReadMarkReason } {
  if (!input.latestInboundMessageId) {
    return { mark: false, reason: "no-inbound" };
  }
  if (!input.documentVisible) return { mark: false, reason: "hidden" };
  const allowed = shouldMarkThreadRead({
    viewerIdentity: input.viewerIdentity,
    canonicalThreadId: input.canonicalThreadId,
    activeDetailThreadId: input.activeDetailThreadId,
    renderedInboundMessageIds: input.renderedInboundMessageIds,
    latestInboundMessageId: input.latestInboundMessageId,
    documentVisibility: input.documentVisible,
  });
  if (!allowed) {
    return {
      mark: false,
      reason: input.activeDetailThreadId !== input.canonicalThreadId ? "not-active" : "not-seen",
    };
  }
  const key = `${input.canonicalThreadId}:${input.viewerIdentity}:${input.latestInboundMessageId}`;
  if (input.alreadyMarkedKey === key) return { mark: false, reason: "already" };
  return { mark: true, reason: "ok" };
}

/** Persist read on exit/back only after the inbound was actually seen. */
export function resolveLeaveThreadRead(input: {
  seenVisible: boolean;
  viewerIdentity: string;
  canonicalThreadId: string;
  activeDetailThreadId: string;
  renderedInboundMessageIds: string[];
  latestInboundMessageId: string;
  alreadyMarkedKey?: string;
}): { mark: boolean; reason: DetailReadMarkReason } {
  if (!input.seenVisible) return { mark: false, reason: "not-seen" };
  return resolveDetailReadMark({
    viewerIdentity: input.viewerIdentity,
    canonicalThreadId: input.canonicalThreadId,
    activeDetailThreadId: input.activeDetailThreadId,
    renderedInboundMessageIds: input.renderedInboundMessageIds,
    latestInboundMessageId: input.latestInboundMessageId,
    documentVisible: true,
    alreadyMarkedKey: input.alreadyMarkedKey,
  });
}

export function isExactActiveDetailThread(
  activeDetailThreadId: string,
  threadId: string,
  aliasIds: string[] = [],
): boolean {
  if (!activeDetailThreadId || !threadId) return false;
  if (activeDetailThreadId === threadId) return true;
  return aliasIds.some((id) => id && id === activeDetailThreadId);
}
