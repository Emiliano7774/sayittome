import assert from "node:assert/strict";
import fs from "node:fs";
import { installHarnessWindow } from "./harness-alias.mjs";

installHarnessWindow();
const {
  createChatWhipHistoryBaseline,
  tryAlertIncomingMessage,
  wasMessageWhipAlerted,
} = await import("../src/lib/chat/whipAlertDedupe.ts");

const attachedAt = 1_000_000;
const chatId = "repeat-alert-fixture";
const alerts = [];
const notify = (messageId, incoming = true, suppress = false, thread = chatId) =>
  tryAlertIncomingMessage({
    chatId: thread, messageId, incoming, suppress,
    onAlert: () => alerts.push(`${thread}:${messageId}`),
  });
const row = (id, createdAtMs) => ({ id, createdAtMs });
const baseline = createChatWhipHistoryBaseline(chatId, attachedAt);

// Execute the same detail-snapshot baseline policy as LegacyChatPage, with the
// global listener racing before the first snapshot and after subsequent ones.
assert.equal(notify("first"), true);
baseline([
  row("old", attachedAt - 60_000),
  row("first", attachedAt - 1_000),
  row("recent", attachedAt - 2_000),
  row("pending", undefined),
  row("invalid", Number.NaN),
]);
assert.equal(wasMessageWhipAlerted(chatId, "old"), true);
assert.equal(notify("old"), false, "initial historical messages stay suppressed");
assert.equal(wasMessageWhipAlerted(chatId, "recent"), false);
assert.equal(wasMessageWhipAlerted(chatId, "pending"), false);
assert.equal(wasMessageWhipAlerted(chatId, "invalid"), false);
assert.equal(notify("first"), false, "detail/global duplicate stays suppressed");

baseline([row("old", attachedAt - 60_000), row("first", attachedAt - 1_000), row("second", attachedAt + 1_000)]);
assert.equal(notify("second"), true, "second live arrival survives detail snapshot");
baseline([row("first", attachedAt - 1_000), row("second", attachedAt + 1_000), row("third", attachedAt + 2_000)]);
assert.equal(notify("third"), true, "third live arrival survives detail snapshot");
assert.equal(notify("second"), false);
assert.equal(notify("third"), false);
assert.deepEqual(alerts, ["first", "second", "third"].map((id) => `${chatId}:${id}`));

assert.equal(notify("late-context", false), false);
assert.equal(wasMessageWhipAlerted(chatId, "late-context"), false,
  "unknown or own classifications do not consume the shared inbound ledger");
assert.equal(notify("late-context", true), true, "hydrated author metadata can retry");
assert.equal(notify("late-context", true), false);
assert.equal(notify("native-detail-owned", true, true), false);
assert.equal(wasMessageWhipAlerted(chatId, "native-detail-owned"), false);
assert.equal(notify("native-detail-owned", true, false), true);
assert.equal(notify("first", true, false, "different-thread"), true,
  "message identity remains scoped by chat");

// An empty initial snapshot must not turn the first live message into history.
const emptyBaseline = createChatWhipHistoryBaseline("initially-empty", attachedAt);
emptyBaseline([]);
emptyBaseline([row("clock-skewed-live", attachedAt - 60_000)]);
assert.equal(wasMessageWhipAlerted("initially-empty", "clock-skewed-live"), false);

// The component must use this policy, not reintroduce its previous blanket
// marking of every message in every snapshot.
const legacy = fs.readFileSync(new URL("../src/app/chat/[chatId]/legacy-chat.tsx", import.meta.url), "utf8");
assert.ok(legacy.includes("const baselineHistory = createChatWhipHistoryBaseline(chatId)"));
assert.ok(legacy.includes("baselineHistory(docs.map"));
assert.equal(legacy.includes("markChatMessagesWhipAlerted("), false);
console.log("PASS incoming_alert_repeat: first/second/third, initial history, pending timestamps, hydrated classification, global/detail dedupe");
