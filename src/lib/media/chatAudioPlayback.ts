export type ChatAudioInspect = {
  mime: string;
  codec: "opus" | "aac" | "mp3" | "wav" | "unknown";
  byteLength: number;
  htmlLikely: boolean;
};

export type ChatAudioObjectUrl = {
  url: string;
  replace(blob: Blob): string;
  revoke(): void;
};

const HTML_LIKELY = /audio\/(mp4|mpeg|mp3|wav|x-wav|aac|m4a)|video\/mp4/;

export function inspectChatAudioBlob(blob: Blob | null | undefined): ChatAudioInspect {
  const mime = String(blob?.type || "").toLowerCase();
  const codec = mime.includes("opus")
    ? "opus"
    : mime.includes("aac") || mime.includes("mp4") || mime.includes("m4a")
      ? "aac"
      : mime.includes("mpeg") || mime.includes("mp3")
        ? "mp3"
        : mime.includes("wav")
          ? "wav"
          : "unknown";
  return {
    mime,
    codec,
    byteLength: Number(blob?.size || 0),
    htmlLikely: HTML_LIKELY.test(mime) || codec === "wav" || codec === "aac" || codec === "mp3",
  };
}

export function chatAudioExtension(mime: string) {
  const lower = String(mime || "").toLowerCase();
  if (lower.includes("wav") || lower.includes("x-wav")) return "wav";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("aac") || lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("ogg")) return "ogg";
  return "webm";
}

export function pickPreferredChatAudioMimeType(
  isTypeSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
) {
  const candidates = [
    "audio/mp4",
    "audio/aac",
    "audio/mpeg",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return "";
}

export function encodePcmToWav(channelData: Float32Array[], sampleRate: number): Blob {
  const channels = Math.max(1, channelData.length);
  const length = channelData[0]?.length || 0;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + length * blockAlign);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + length * blockAlign, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, length * blockAlign, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel]?.[i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function createChatAudioObjectUrl(
  createObjectURL: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url: string) => void = (url) => URL.revokeObjectURL(url),
): ChatAudioObjectUrl {
  let url = "";
  return {
    get url() {
      return url;
    },
    replace(blob: Blob) {
      if (url) revokeObjectURL(url);
      url = createObjectURL(blob);
      return url;
    },
    revoke() {
      if (!url) return;
      revokeObjectURL(url);
      url = "";
    },
  };
}

export async function preparePlayableChatAudio(
  blob: Blob,
  deps?: {
    decode?: (input: Blob) => Promise<{ sampleRate: number; channelData: Float32Array[] }>;
  },
): Promise<{ blob: Blob; mime: string; prepared: "passthrough" | "wav"; decodeFailed?: boolean }> {
  const info = inspectChatAudioBlob(blob);
  if (info.htmlLikely) {
    return { blob, mime: info.mime || "audio/wav", prepared: "passthrough" };
  }

  const decode =
    deps?.decode ||
    (typeof AudioContext !== "undefined" ||
    typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined"
      ? async (input: Blob) => {
          const decoded = await decodeChatAudioWithContext(input);
          await decoded.context.close().catch(() => {});
          return { sampleRate: decoded.sampleRate, channelData: decoded.channelData };
        }
      : null);

  if (!decode) {
    return { blob, mime: info.mime || "audio/webm", prepared: "passthrough" };
  }
  try {
    const decoded = await decode(blob);
    const wav = encodePcmToWav(decoded.channelData, decoded.sampleRate || 16000);
    return { blob: wav, mime: "audio/wav", prepared: "wav" };
  } catch {
    return { blob, mime: info.mime || "audio/webm", prepared: "passthrough", decodeFailed: true };
  }
}

export async function decodeChatAudioWithContext(blob: Blob) {
  const Ctx =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("audio_context_unavailable");
  const context = new Ctx();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channelData = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
      buffer.getChannelData(index),
    );
    return { sampleRate: buffer.sampleRate, channelData, buffer, context };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

export async function playChatAudioElement(
  element: {
    muted: boolean;
    volume: number;
    src: string;
    load?: () => void;
    play: () => Promise<void>;
  },
  src: string,
) {
  element.muted = false;
  element.volume = 1;
  if (element.src !== src) {
    element.src = src;
    element.load?.();
  }
  await element.play();
}

export async function playChatAudioBuffer(
  src: string,
  deps?: {
    fetchBuffer?: (url: string) => Promise<ArrayBuffer>;
    decode?: (buffer: ArrayBuffer) => Promise<{ duration: number; start: () => void; stop?: () => void }>;
    onEnded?: () => void;
  },
): Promise<{ stop: () => void }> {
  const fetchBuffer =
    deps?.fetchBuffer || ((url: string) => fetch(url).then((response) => response.arrayBuffer()));
  if (deps?.decode) {
    const decoded = await deps.decode(await fetchBuffer(src));
    decoded.start();
    return {
      stop() {
        decoded.stop?.();
        deps.onEnded?.();
      },
    };
  }
  const decoded = await decodeChatAudioWithContext(new Blob([await fetchBuffer(src)]));
  const source = decoded.context.createBufferSource();
  const gain = decoded.context.createGain();
  gain.gain.value = 1;
  source.buffer = decoded.buffer;
  source.connect(gain);
  gain.connect(decoded.context.destination);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      source.disconnect();
    } catch {
      // already stopped
    }
    await decoded.context.close().catch(() => {});
  };
  source.onended = () => {
    deps?.onEnded?.();
    void close();
  };
  if (decoded.context.state === "suspended") await decoded.context.resume();
  source.start(0);
  return {
    stop() {
      try {
        source.stop();
      } catch {
        // already ended
      }
      deps?.onEnded?.();
      void close();
    },
  };
}

export function classifyChatAudioPlayFailure(error: unknown) {
  const name = String((error as { name?: string } | null)?.name || "");
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  if (name === "NotAllowedError" || message.includes("notallowed")) return "blocked";
  if (message.includes("decode") || message.includes("notsupported") || name === "NotSupportedError") {
    return "unsupported";
  }
  return "failed";
}
