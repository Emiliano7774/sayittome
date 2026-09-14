/**
 * Rules emulator cannot evaluate increment()/serverTimestamp() in outgoing guards.
 * Materialize the shared production constructor output to literal maps for harness
 * probes — same keys/values the production path would produce after commit.
 */
export function isIncrementField(value) {
  return (
    value &&
    typeof value === "object" &&
    (value._methodName === "increment" ||
      (typeof value._delegate?.methodName === "string" &&
        value._delegate.methodName.includes("increment")))
  );
}

export function isServerTimestampField(value) {
  return (
    value &&
    typeof value === "object" &&
    (value._methodName === "serverTimestamp" ||
      (typeof value._delegate?.methodName === "string" &&
        value._delegate.methodName.includes("serverTimestamp")))
  );
}

function clonePlain(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = clonePlain(child);
  }
  return out;
}

export function materializeOutgoingBatchForRulesEmulator(batch, baselineUnreadCounts = {}) {
  const chatWritePayload = clonePlain(batch.chatWritePayload);
  const messagePayload = clonePlain(batch.messagePayload);

  const nextUnread = { ...baselineUnreadCounts };
  if (chatWritePayload.unreadCounts && typeof chatWritePayload.unreadCounts === "object") {
    for (const [key, value] of Object.entries(chatWritePayload.unreadCounts)) {
      if (isIncrementField(value)) {
        nextUnread[key] = Number(baselineUnreadCounts[key] || 0) + 1;
      } else if (!isServerTimestampField(value)) {
        nextUnread[key] = value;
      }
    }
  }
  chatWritePayload.unreadCounts = nextUnread;

  return { chatWritePayload, messagePayload };
}
