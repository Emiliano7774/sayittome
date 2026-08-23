export type ChatAudioRecorderLike = {
  state: string;
  stop: () => void;
  ondataavailable?: unknown;
  onstop?: unknown;
  onerror?: unknown;
};

export type ChatAudioStreamLike = {
  getTracks: () => Array<{ stop: () => void }>;
};

export type ChatAudioDiscardTarget = {
  session: { current: number };
  recorder: { current: ChatAudioRecorderLike | null };
  stream: { current: ChatAudioStreamLike | null };
  chunks: { current: unknown[] };
  phase?: { current: string };
};

export type ChatAudioDiscardResult = {
  session: number;
  stoppedRecorder: boolean;
  neutralizedCallbacks: boolean;
  stoppedTracks: number;
  recorderAlive: boolean;
};

function asRecorder(value: ChatAudioRecorderLike | null): ChatAudioRecorderLike | null {
  return value && typeof value.stop === "function" ? value : null;
}

function asStream(value: ChatAudioStreamLike | null): ChatAudioStreamLike | null {
  return value && typeof value.getTracks === "function" ? value : null;
}

/**
 * Stop hardware without invalidating the session. Used after a deliberate
 * preview stop, once onstop has already been allowed to run.
 */
export function cleanupChatAudioRecorder(target: {
  recorder: { current: ChatAudioRecorderLike | null };
  stream: { current: ChatAudioStreamLike | null };
  chunks: { current: unknown[] };
}): Pick<ChatAudioDiscardResult, "stoppedRecorder" | "neutralizedCallbacks" | "stoppedTracks" | "recorderAlive"> {
  const recorder = asRecorder(target.recorder.current);
  target.recorder.current = null;
  target.chunks.current = [];

  let neutralizedCallbacks = false;
  let stoppedRecorder = false;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    neutralizedCallbacks = true;
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
        stoppedRecorder = true;
      } catch {
        // Ignore stop races while the recorder is already closing.
      }
    }
  }

  const stream = asStream(target.stream.current);
  target.stream.current = null;
  let stoppedTracks = 0;
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
      stoppedTracks += 1;
    } catch {
      // Track may already be ended.
    }
  }

  return {
    stoppedRecorder,
    neutralizedCallbacks,
    stoppedTracks,
    recorderAlive: target.recorder.current !== null,
  };
}

/**
 * Cancel / unmount contract: invalidate the session first, neutralize
 * onstop so a later stop cannot build a preview, then stop the recorder
 * and tracks. Idempotent; never leaves a live recorder on the refs.
 */
export function discardChatAudioRecording(target: ChatAudioDiscardTarget): ChatAudioDiscardResult {
  target.session.current += 1;
  const cleaned = cleanupChatAudioRecorder(target);
  if (target.phase) target.phase.current = "idle";
  return {
    session: target.session.current,
    ...cleaned,
  };
}
