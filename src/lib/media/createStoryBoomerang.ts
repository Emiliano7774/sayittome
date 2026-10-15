/**
 * Builds a low-bandwidth silent, ping-pong preview from the FIRST three seconds.
 * Everything happens locally before the original video is uploaded.
 * Decoding/encoding failures degrade to a static cover, never a full-video feed download.
 */
export async function createStoryBoomerang(file: File): Promise<{
  thumbnail: File | null;
  boomerang: File | null;
}> {
  const empty = { thumbnail: null, boomerang: null };
  if (typeof document === "undefined" || typeof window === "undefined") return empty;
  const src = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  const bitmaps: ImageBitmap[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("preview_decode_timeout")), 8000);
      video.onloadeddata = () => { window.clearTimeout(timer); resolve(); };
      video.onerror = () => { window.clearTimeout(timer); reject(new Error("preview_decode_error")); };
      video.src = src;
      video.load();
    });
    if (!video.videoWidth || !video.videoHeight) return empty;

    const scale = Math.min(1, 288 / video.videoWidth, 384 / video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return empty;

    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(3, video.duration) : 3;
    const framePromises: Promise<ImageBitmap>[] = [];
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let nextSampleAt = 0;
      let raf = 0;
      const timer = window.setTimeout(() => finish(), 6200);
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        window.cancelAnimationFrame(raf);
        video.pause();
        if (error) reject(error);
        else resolve();
      };
      const tick = () => {
        if (finished) return;
        if (video.readyState >= 2 && video.currentTime >= nextSampleAt) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          framePromises.push(createImageBitmap(canvas));
          nextSampleAt = video.currentTime + 0.1;
        }
        if (video.ended || video.currentTime >= duration - 0.035) {
          finish();
          return;
        }
        raf = window.requestAnimationFrame(tick);
      };
      video.onended = () => finish();
      video.currentTime = 0;
      void video.play().then(() => {
        raf = window.requestAnimationFrame(tick);
      }).catch(() => finish(new Error("preview_local_play_failed")));
    });

    bitmaps.push(...await Promise.all(framePromises));
    if (!bitmaps.length) return empty;
    ctx.drawImage(bitmaps[bitmaps.length - 1], 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.65));
    const thumbnail = jpeg && jpeg.size > 0 && jpeg.size <= 160_000
      ? new File([jpeg], "story-cover.jpg", { type: "image/jpeg" }) : null;

    const CanvasPrototype = HTMLCanvasElement.prototype as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    if (bitmaps.length < 4 || typeof CanvasPrototype.captureStream !== "function" ||
        typeof MediaRecorder === "undefined") return { thumbnail, boomerang: null };

    const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return { thumbnail, boomerang: null };

    const recordingCanvas = document.createElement("canvas");
    recordingCanvas.width = canvas.width;
    recordingCanvas.height = canvas.height;
    const recordingCtx = recordingCanvas.getContext("2d", { alpha: false });
    if (!recordingCtx) return { thumbnail, boomerang: null };

    const stream = recordingCanvas.captureStream(10);
    const chunks: Blob[] = [];
    try {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 150_000 });
      const sequence = [
        ...bitmaps,
        ...bitmaps.slice(1, -1).reverse(),
      ];
      let frame = 0;
      const blob = await new Promise<Blob | null>((resolve) => {
        let ended = false;
        let interval = 0;
        const timeout = window.setTimeout(() => stop(), 13_000);
        const stop = () => {
          if (ended) return;
          ended = true;
          window.clearInterval(interval);
          window.clearTimeout(timeout);
          if (recorder.state !== "inactive") {
            try { recorder.stop(); } catch { resolve(null); }
          } else {
            resolve(null);
          }
        };
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, {type: mimeType}) : null);
        recorder.onerror = () => stop();
        try {
          recordingCtx.drawImage(sequence[0], 0, 0, canvas.width, canvas.height);
          recorder.start();
          interval = window.setInterval(() => {
            const image = sequence[frame++];
            if (image) recordingCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
            if (frame >= sequence.length) stop();
          }, 100);
        } catch { stop(); }
      });
      if (!blob || !blob.size || blob.size > 500_000) return { thumbnail, boomerang: null };
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      return {
        thumbnail,
        boomerang: new File([blob], `story-boomerang.${extension}`, {type: mimeType.split(";")[0]}),
      };
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  } catch (error) {
    console.warn("story_boomerang_generation_failed", error);
    return empty;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(src);
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
