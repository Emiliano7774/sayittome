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

export function isExactActiveDetailThread(
  activeDetailThreadId: string,
  threadId: string,
  aliasIds: string[] = [],
): boolean {
  if (!activeDetailThreadId || !threadId) return false;
  if (activeDetailThreadId === threadId) return true;
  return aliasIds.some((id) => id && id === activeDetailThreadId);
}
