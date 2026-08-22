"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import {
  classifyChatAudioPlayFailure,
  playChatAudioBuffer,
  playChatAudioElement,
} from "@/lib/media/chatAudioPlayback";

type Props = {
  src: string;
  failLabel: string;
  className?: string;
};

function ChatAudioPlayerInner({ src, failLabel, className }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fallbackStopRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const usingFallbackRef = useRef(false);

  function stopFallback() {
    fallbackStopRef.current?.();
    fallbackStopRef.current = null;
    usingFallbackRef.current = false;
  }

  useEffect(() => {
    const node = audioRef.current;
    if (node && src) {
      node.muted = false;
      node.volume = 1;
      node.load();
    }
    return () => {
      fallbackStopRef.current?.();
      fallbackStopRef.current = null;
      usingFallbackRef.current = false;
      if (!node) return;
      node.pause();
      node.removeAttribute("src");
    };
  }, [src]);

  async function handlePlay() {
    if (!src) {
      setError(failLabel);
      return;
    }
    const node = audioRef.current;
    if (!node) return;
    setError("");
    if (playing) {
      node.pause();
      stopFallback();
      setPlaying(false);
      return;
    }
    try {
      usingFallbackRef.current = false;
      await playChatAudioElement(node, src);
      setPlaying(true);
    } catch (elementError) {
      try {
        node.pause();
        const playback = await playChatAudioBuffer(src, {
          onEnded: () => {
            fallbackStopRef.current = null;
            usingFallbackRef.current = false;
            setPlaying(false);
          },
        });
        fallbackStopRef.current = playback.stop;
        usingFallbackRef.current = true;
        setPlaying(true);
      } catch (bufferError) {
        classifyChatAudioPlayFailure(bufferError || elementError);
        setError(failLabel);
        setPlaying(false);
        usingFallbackRef.current = false;
      }
    }
  }

  return (
    <div className={["relative flex min-w-[220px] flex-col gap-2", className || ""].join(" ")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handlePlay();
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/20"
          aria-label={playing ? "Pausar" : "Reproducir"}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          playsInline
          className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          onPlay={() => {
            if (!usingFallbackRef.current) setPlaying(true);
          }}
          onPause={() => {
            if (!usingFallbackRef.current) setPlaying(false);
          }}
          onEnded={() => {
            if (!usingFallbackRef.current) setPlaying(false);
          }}
          onError={() => setError(failLabel)}
        />
        <span className="text-sm font-semibold text-white/70">Audio</span>
      </div>
      {error ? <p className="text-xs font-semibold text-red-300">{error}</p> : null}
    </div>
  );
}

export default function ChatAudioPlayer(props: Props) {
  return <ChatAudioPlayerInner key={props.src} {...props} />;
}
