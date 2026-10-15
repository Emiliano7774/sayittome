/**
 * Extract a small, static cover from the local File before uploading a story.
 * No Firebase reads or transcoding service; the source video never leaves the device for this operation.
 */
export async function createStoryVideoPoster(file: File): Promise<File | null> {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;

  const source = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const settle = (error?: Error) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.onseeked = null;
        video.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      const ready = () => {
        if (!video.seeking && video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
          settle();
        }
      };
      const timer = window.setTimeout(() => settle(new Error("story_poster_timeout")), 8000);
      video.onerror = () => settle(new Error("story_poster_decode_failed"));
      video.onseeked = ready;
      video.onloadeddata = ready;
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        // Prefer a representative frame up to 3s in, but never seek beyond the end.
        const target = duration > 0 ? Math.min(3, Math.max(0, duration - 0.1)) : 0;
        if (target > 0.05) {
          try { video.currentTime = target; } catch { ready(); }
        } else {
          ready();
        }
      };
      video.src = source;
      video.load();
    });

    const maxWidth = 480;
    const maxHeight = 640;
    const scale = Math.min(1, maxWidth / video.videoWidth, maxHeight / video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.68));
    if (!blob || blob.size === 0 || blob.size > 160 * 1024) return null;
    return new File([blob], "story-cover.jpg", { type: "image/jpeg" });
  } catch (error) {
    console.warn("story_video_poster_unavailable", error);
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(source);
  }
}
