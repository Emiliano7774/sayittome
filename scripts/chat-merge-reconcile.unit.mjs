/**
 * Unit checks for profile↔anon optimistic merge rules.
 * Run: node scripts/chat-merge-reconcile.unit.mjs
 */

function mergeLoadedChatMessages(loaded, pending) {
  const merged = loaded.map((message) => ({ ...message }));
  const claimed = new Set();

  for (const optimistic of pending) {
    let matchIndex = -1;

    if (optimistic.clientId) {
      matchIndex = merged.findIndex(
        (message, index) =>
          !claimed.has(index) && message.clientId === optimistic.clientId,
      );
    }

    if (matchIndex < 0) {
      matchIndex = merged.findIndex((message, index) => {
        if (claimed.has(index)) return false;
        if (!optimistic.mine || !message.mine) return false;
        const sameAuthor =
          Boolean(optimistic.fromUid) &&
          Boolean(message.fromUid) &&
          optimistic.fromUid === message.fromUid;
        if (!sameAuthor) return false;
        return (
          message.text === optimistic.text &&
          (message.type || "text") === (optimistic.type || "text") &&
          (message.mediaUrl || "") === (optimistic.mediaUrl || "")
        );
      });
    }

    if (matchIndex >= 0) {
      claimed.add(matchIndex);
      merged[matchIndex] = {
        ...merged[matchIndex],
        ...(optimistic.clientId ? { clientId: optimistic.clientId } : {}),
        status: undefined,
      };
      continue;
    }

    merged.push(optimistic);
  }

  return merged;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Same text from peer must NOT consume profile optimistic.
{
  const loaded = [
    { id: "a1", text: "hola", mine: true, fromUid: "anon_visitor", senderKind: "anon" },
  ];
  const pending = [
    {
      id: "c1",
      clientId: "c1",
      text: "hola",
      mine: true,
      fromUid: "profile_owner",
      senderKind: "profile",
      status: "sending",
    },
  ];
  const merged = mergeLoadedChatMessages(loaded, pending);
  assert(merged.length === 2, "expected optimistic kept alongside peer same text");
  assert(
    merged.some((m) => m.clientId === "c1" && m.status === "sending"),
    "optimistic profile reply must remain until own ack",
  );
}

// clientId match clears sending.
{
  const loaded = [
    {
      id: "doc1",
      clientId: "c1",
      text: "hola",
      mine: true,
      fromUid: "profile_owner",
      senderKind: "profile",
    },
  ];
  const pending = [
    {
      id: "c1",
      clientId: "c1",
      text: "hola",
      mine: true,
      fromUid: "profile_owner",
      senderKind: "profile",
      status: "sending",
    },
  ];
  const merged = mergeLoadedChatMessages(loaded, pending);
  assert(merged.length === 1, "clientId reconcile should collapse");
  assert(!merged[0].status, "status cleared on ack");
}

console.log(
  JSON.stringify(
    {
      gate: "CHAT_MERGE_RECONCILE_UNIT",
      pass: true,
      cases: ["peer_same_text_keeps_optimistic", "clientId_ack_collapse"],
    },
    null,
    2,
  ),
);
