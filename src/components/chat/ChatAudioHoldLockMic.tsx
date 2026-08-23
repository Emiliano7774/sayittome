"use client";

import { Lock, Mic } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { useT } from "@/contexts/LocaleContext";
import {
  CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
  createChatAudioHoldLockState,
  formatChatAudioHoldTimer,
  reduceChatAudioHoldElapsed,
  reduceChatAudioHoldLock,
  type ChatAudioHoldLockState,
} from "@/lib/media/chatAudioHoldLock";

type Props = {
  recording: boolean;
  disabled?: boolean;
  isClassic?: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
};

function lockedHoldState(): ChatAudioHoldLockState {
  return {
    ...createChatAudioHoldLockState(),
    phase: "locked",
    liftPx: CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX,
    lockProgress: 1,
    suppressClick: true,
  };
}

function visibleHoldState(view: ChatAudioHoldLockState, recording: boolean) {
  return recording && view.phase === "idle" ? lockedHoldState() : view;
}

export default function ChatAudioHoldLockMic({
  recording,
  disabled = false,
  isClassic = false,
  onStart,
  onStop,
  onCancel,
}: Props) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const stateRef = useRef<ChatAudioHoldLockState>(createChatAudioHoldLockState());
  const [view, setView] = useState(createChatAudioHoldLockState);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerRecording, setTimerRecording] = useState(recording);
  const startedAtRef = useRef(0);
  const recordingRef = useRef(recording);
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);
  const onCancelRef = useRef(onCancel);

  if (recording !== timerRecording) {
    setTimerRecording(recording);
    setElapsedMs(
      reduceChatAudioHoldElapsed(elapsedMs, {
        type: recording ? "recording-started" : "recording-stopped",
      }),
    );
  }

  useEffect(() => {
    recordingRef.current = recording;
    onStartRef.current = onStart;
    onStopRef.current = onStop;
    onCancelRef.current = onCancel;
  });

  function machineState() {
    return visibleHoldState(stateRef.current, recordingRef.current);
  }

  function commit(next: ReturnType<typeof reduceChatAudioHoldLock>) {
    stateRef.current = next.state;
    setView(next.state);
    if (next.startCapture) onStartRef.current();
    if (next.stopCapture) onStopRef.current();
    if (next.discardCapture) onCancelRef.current();
    return next;
  }

  useEffect(() => {
    return () => {
      const next = reduceChatAudioHoldLock(machineState(), { type: "unmount" });
      if (next.discardCapture) onCancelRef.current();
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      startedAtRef.current = 0;
      return undefined;
    }
    startedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- snap timer to 00:00 on recording start
    setElapsedMs(0);
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  function applyPointer(
    type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostcapture",
    event: PointerEvent<HTMLButtonElement>,
  ) {
    if (disabled && type === "pointerdown") return;
    if (type === "pointerdown" && event.button !== 0) return;
    if (type === "pointerdown" && recording && stateRef.current.phase === "idle") return;

    const next = reduceChatAudioHoldLock(
      stateRef.current,
      type === "pointerdown" || type === "pointermove"
        ? { type, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
        : { type, pointerId: event.pointerId },
    );

    if (type === "pointerdown" && next.capturePointer) {
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture can fail if the node is gone.
      }
    }

    // Commit before releasePointerCapture so a sync lostpointercapture sees
    // the locked phase and does not stop an in-flight hands-free recording.
    commit(next);

    if (next.releasePointer) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // already released
      }
    }
  }

  const shown = visibleHoldState(view, recording);
  const holding = shown.phase === "holding" || shown.phase === "locking";
  const locked = shown.phase === "locked";
  const lift = Math.min(shown.liftPx, CHAT_AUDIO_HOLD_LOCK_THRESHOLD_PX);
  const timerLabel = formatChatAudioHoldTimer(recording ? elapsedMs : 0);

  return (
    <div className="relative shrink-0">
      {holding ? (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 flex w-max -translate-x-1/2 flex-col items-center gap-2"
          data-chat-audio-hold-hint="1"
        >
          <div
            className={[
              "flex h-10 w-10 items-center justify-center border text-violet-200",
              isClassic
                ? "rounded-full border-violet-400/40 bg-violet-500/15"
                : "rounded-2xl border-violet-400/35 bg-violet-500/15",
            ].join(" ")}
            style={{ transform: `translateY(${-lift}px)` }}
            data-chat-audio-hold-lock-icon="1"
          >
            <Lock size={16} />
          </div>
          <p className="max-w-[11rem] text-center text-[11px] font-bold text-white/70">
            {t("chat_mic_slide_to_lock")}
          </p>
        </div>
      ) : null}

      {locked && recording ? (
        <div
          className={[
            "absolute bottom-full right-0 z-20 mb-2 flex w-max items-center gap-2 border px-2 py-1.5",
            isClassic
              ? "rounded-full border-white/15 bg-black"
              : "rounded-2xl border-white/10 bg-black/95",
          ].join(" ")}
          data-chat-audio-hold-locked="1"
        >
          <span className="min-w-[3.25rem] text-center text-xs font-black tabular-nums text-red-300">
            {timerLabel}
          </span>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-black text-white/80"
            onClick={() => {
              commit(reduceChatAudioHoldLock(machineState(), { type: "cancel" }));
            }}
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            className={[
              "rounded-full px-3 py-1.5 text-xs font-black text-white",
              isClassic ? "bg-fuchsia-600" : "bg-violet-500",
            ].join(" ")}
            onClick={() => {
              commit(reduceChatAudioHoldLock(machineState(), { type: "stop" }));
            }}
          >
            {t("chat_mic_stop_preview")}
          </button>
        </div>
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={locked ? t("chat_mic_locked") : t("chat_mic_slide_to_lock")}
        style={{ touchAction: "none" }}
        onPointerDown={(event) => applyPointer("pointerdown", event)}
        onPointerMove={(event) => applyPointer("pointermove", event)}
        onPointerUp={(event) => applyPointer("pointerup", event)}
        onPointerCancel={(event) => applyPointer("pointercancel", event)}
        onLostPointerCapture={(event) => applyPointer("lostcapture", event)}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (disabled || recording) return;
          commit(reduceChatAudioHoldLock(stateRef.current, { type: "activate" }));
        }}
        onClick={(event) => {
          event.preventDefault();
          if (stateRef.current.suppressClick) {
            commit(reduceChatAudioHoldLock(stateRef.current, { type: "consume-click" }));
            return;
          }
          if (disabled || recording || stateRef.current.phase !== "idle") return;
          commit(reduceChatAudioHoldLock(stateRef.current, { type: "activate" }));
        }}
        className={
          isClassic
            ? [
                "rounded-full px-5 py-4 text-sm font-black text-white transition",
                recording
                  ? "bg-red-500 hover:scale-[1.02]"
                  : "border border-white/10 bg-black hover:border-fuchsia-400",
              ].join(" ")
            : [
                "flex h-10 w-10 items-center justify-center rounded-2xl border transition",
                recording
                  ? "border-red-400/50 bg-red-500/20 text-red-300"
                  : "border-white/10 bg-white/[0.06] text-white/70",
              ].join(" ")
        }
      >
        {isClassic ? (locked ? t("chat_mic_locked") : recording ? "Stop" : "Audio") : <Mic size={19} />}
      </button>
    </div>
  );
}
