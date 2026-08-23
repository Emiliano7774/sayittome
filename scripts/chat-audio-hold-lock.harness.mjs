/**
 * CHAT_AUDIO_HOLD_LOCK
 * Shared press-and-hold → slide-up lock machine used by both composers.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const hold = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioHoldLock.ts")).href
);

const modern = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const classic = fs.readFileSync(
  path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"),
  "utf8",
);
const mic = fs.readFileSync(
  path.join(root, "src/components/chat/ChatAudioHoldLockMic.tsx"),
  "utf8",
);
const i18n = fs.readFileSync(path.join(root, "src/lib/i18n/messages.ts"), "utf8");

assert.match(modern, /import ChatAudioHoldLockMic from "@\/components\/chat\/ChatAudioHoldLockMic"/);
assert.match(classic, /import ChatAudioHoldLockMic from "@\/components\/chat\/ChatAudioHoldLockMic"/);
assert.match(classic, /import \{ discardChatAudioRecording \} from "@\/lib\/media\/chatAudioRecorderCleanup"/);
assert.match(classic, /discardChatAudioRecording\(\{\s*session: audioRecordingSessionRef/);
assert.match(mic, /setElapsedMs\(0\)/);
assert.match(modern, /onCancel=\{cancelAudioRecording\}/);
assert.match(classic, /onCancel=\{cancelRecording\}/);
assert.match(modern, /reduceChatAudioEvent\(audioPhaseRef\.current, \{\s*type: "cancel"/);
assert.match(classic, /reduceChatAudioEvent\(audioPhaseRef\.current, \{\s*type: "cancel"/);
assert.doesNotMatch(modern, /Grabando audio\.\.\. tocá para terminar/);
assert.match(mic, /reduceChatAudioHoldLock/);
assert.match(mic, /setPointerCapture/);
assert.match(mic, /touchAction: "none"/);
assert.match(mic, /chat_mic_slide_to_lock/);
assert.match(mic, /chat_mic_stop_preview/);
assert.doesNotMatch(mic, /MediaRecorder|getUserMedia|captureTrustedChatAudioStream/);
assert.match(i18n, /chat_mic_slide_to_lock: "Deslizá hacia arriba para bloquear"/);

const {
  CHAT_AUDIO_HOLD_TOUCH_SLOP_PX,
  CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
  CHAT_AUDIO_HOLD_LOCK_HYSTERESIS_PX,
  createChatAudioHoldLockState,
  reduceChatAudioHoldLock,
  formatChatAudioHoldTimer,
} = hold;

assert.equal(CHAT_AUDIO_HOLD_TOUCH_SLOP_PX, 12);
assert.equal(CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX, 72);
assert.equal(CHAT_AUDIO_HOLD_LOCK_HYSTERESIS_PX, 16);
assert.equal(formatChatAudioHoldTimer(0), "00:00");
assert.equal(formatChatAudioHoldTimer(65_000), "01:05");

function step(state, event) {
  return reduceChatAudioHoldLock(state, event);
}

// start → move below threshold → release stops (preview path)
{
  let decision = step(createChatAudioHoldLockState(), {
    type: "pointerdown",
    pointerId: 1,
    x: 40,
    y: 400,
  });
  assert.equal(decision.state.phase, "holding");
  assert.equal(decision.startCapture, true);
  assert.equal(decision.capturePointer, true);
  assert.equal(decision.stopCapture, false);

  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 1,
    x: 40,
    y: 392,
  });
  assert.equal(decision.state.phase, "holding");
  assert.ok(decision.state.liftPx < CHAT_AUDIO_HOLD_TOUCH_SLOP_PX);
  assert.equal(decision.stopCapture, false);
  assert.equal(decision.state.lockProgress, 0);

  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 1,
    x: 40,
    y: 360,
  });
  assert.equal(decision.state.phase, "locking");
  assert.ok(decision.state.liftPx < CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX);
  assert.equal(decision.startCapture, false);

  decision = step(decision.state, { type: "pointerup", pointerId: 1 });
  assert.equal(decision.state.phase, "idle");
  assert.equal(decision.stopCapture, true);
  assert.equal(decision.discardCapture, false);
  assert.equal(decision.releasePointer, true);
  assert.equal(decision.consumeClick, true);
}

// start → move up → locked → release keeps recording → stop
{
  let decision = step(createChatAudioHoldLockState(), {
    type: "pointerdown",
    pointerId: 7,
    x: 20,
    y: 500,
  });
  assert.equal(decision.startCapture, true);

  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 7,
    x: 22,
    y: 500 - (CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX - 1),
  });
  assert.equal(decision.state.phase, "locking");
  assert.equal(decision.releasePointer, false);

  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 7,
    x: 22,
    y: 500 - CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
  });
  assert.equal(decision.state.phase, "locked");
  assert.equal(decision.releasePointer, true);
  assert.equal(decision.stopCapture, false);
  assert.equal(decision.startCapture, false);

  decision = step(decision.state, { type: "pointerup", pointerId: 7 });
  assert.equal(decision.state.phase, "locked");
  assert.equal(decision.stopCapture, false);
  assert.equal(decision.discardCapture, false);
  assert.equal(decision.state.pointerId, null);

  decision = step(decision.state, { type: "stop" });
  assert.equal(decision.state.phase, "idle");
  assert.equal(decision.stopCapture, true);
  assert.equal(decision.discardCapture, false);
}

// cancel discards while locked
{
  let decision = step(createChatAudioHoldLockState(), { type: "activate" });
  assert.equal(decision.state.phase, "locked");
  assert.equal(decision.startCapture, true);

  decision = step(decision.state, { type: "cancel" });
  assert.equal(decision.state.phase, "idle");
  assert.equal(decision.discardCapture, true);
  assert.equal(decision.stopCapture, false);
}

// pointercancel / lostcapture while holding stop; while locked they do not
{
  let decision = step(createChatAudioHoldLockState(), {
    type: "pointerdown",
    pointerId: 3,
    x: 10,
    y: 200,
  });
  decision = step(decision.state, { type: "pointercancel", pointerId: 3 });
  assert.equal(decision.state.phase, "idle");
  assert.equal(decision.stopCapture, true);
  assert.equal(decision.discardCapture, false);

  decision = step(createChatAudioHoldLockState(), {
    type: "pointerdown",
    pointerId: 4,
    x: 10,
    y: 200,
  });
  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 4,
    x: 10,
    y: 200 - CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
  });
  assert.equal(decision.state.phase, "locked");
  decision = step(decision.state, { type: "lostcapture", pointerId: 4 });
  assert.equal(decision.state.phase, "locked");
  assert.equal(decision.stopCapture, false);
  assert.equal(decision.discardCapture, false);
}

// unmount never leaves a live session
{
  let decision = step(createChatAudioHoldLockState(), {
    type: "pointerdown",
    pointerId: 9,
    x: 0,
    y: 80,
  });
  decision = step(decision.state, { type: "unmount" });
  assert.equal(decision.state.phase, "idle");
  assert.equal(decision.discardCapture, true);
  assert.equal(decision.releasePointer, true);

  decision = step(createChatAudioHoldLockState(), { type: "unmount" });
  assert.equal(decision.discardCapture, false);
}

// extra pointers are ignored; only the captured pointer can lock/stop
{
  let decision = step(createChatAudioHoldLockState(), {
    type: "pointerdown",
    pointerId: 1,
    x: 8,
    y: 300,
  });
  const afterSecondDown = step(decision.state, {
    type: "pointerdown",
    pointerId: 2,
    x: 8,
    y: 100,
  });
  assert.equal(afterSecondDown.startCapture, false);
  assert.equal(afterSecondDown.state.phase, "holding");
  assert.equal(afterSecondDown.state.pointerId, 1);

  const afterSecondUp = step(afterSecondDown.state, {
    type: "pointerup",
    pointerId: 2,
  });
  assert.equal(afterSecondUp.stopCapture, false);
  assert.equal(afterSecondUp.state.phase, "holding");

  const afterSecondMove = step(afterSecondUp.state, {
    type: "pointermove",
    pointerId: 2,
    x: 8,
    y: 10,
  });
  assert.equal(afterSecondMove.state.phase, "holding");
  assert.equal(afterSecondMove.state.liftPx, 0);

  decision = step(afterSecondMove.state, { type: "pointerup", pointerId: 1 });
  assert.equal(decision.stopCapture, true);
  assert.equal(decision.state.phase, "idle");
}

// hysteresis: locking can drop back below slop; lock itself is sticky
{
  let decision = step(createChatAudioHoldLockState(), {
    type: "pointerdown",
    pointerId: 5,
    x: 0,
    y: 400,
  });
  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 5,
    x: 0,
    y: 400 - 40,
  });
  assert.equal(decision.state.phase, "locking");

  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 5,
    x: 0,
    y: 400 - 4,
  });
  assert.equal(decision.state.phase, "holding");
  assert.ok(
    4 <
      CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX - CHAT_AUDIO_HOLD_LOCK_HYSTERESIS_PX,
  );

  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 5,
    x: 0,
    y: 400 - CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
  });
  assert.equal(decision.state.phase, "locked");

  decision = step(decision.state, {
    type: "pointermove",
    pointerId: 5,
    x: 0,
    y: 400,
  });
  assert.equal(decision.state.phase, "locked");
}

const cleanup = await import(
  pathToFileURL(path.join(root, "src/lib/media/chatAudioRecorderCleanup.ts")).href
);

{
  let previewBuilt = 0;
  let trackStops = 0;
  const recorder = {
    state: "recording",
    stop() {
      this.state = "inactive";
      this.onstop?.();
    },
    ondataavailable: () => {},
    onstop: () => {
      previewBuilt += 1;
    },
    onerror: () => {},
  };
  const stream = {
    getTracks: () => [
      {
        stop() {
          trackStops += 1;
        },
      },
    ],
  };
  const target = {
    session: { current: 4 },
    recorder: { current: recorder },
    stream: { current: stream },
    chunks: { current: ["chunk"] },
    phase: { current: "recording" },
  };

  const first = cleanup.discardChatAudioRecording(target);
  assert.equal(first.session, 5);
  assert.equal(first.stoppedRecorder, true);
  assert.equal(first.neutralizedCallbacks, true);
  assert.equal(first.stoppedTracks, 1);
  assert.equal(first.recorderAlive, false);
  assert.equal(target.recorder.current, null);
  assert.equal(target.stream.current, null);
  assert.deepEqual(target.chunks.current, []);
  assert.equal(target.phase.current, "idle");
  assert.equal(recorder.onstop, null);
  assert.equal(previewBuilt, 0);
  assert.equal(trackStops, 1);

  const second = cleanup.discardChatAudioRecording(target);
  assert.equal(second.session, 6);
  assert.equal(second.stoppedRecorder, false);
  assert.equal(second.neutralizedCallbacks, false);
  assert.equal(second.stoppedTracks, 0);
  assert.equal(second.recorderAlive, false);
  assert.equal(previewBuilt, 0);
}

console.log(JSON.stringify({ gate: "CHAT_AUDIO_HOLD_LOCK", pass: true }, null, 2));
