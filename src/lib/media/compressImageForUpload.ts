type CompressOptions = {
  maxEdge?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
};

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}

/**
 * Downscale oversized photos before Storage upload.
 * Skips non-images and tiny files. Falls back to the original File on failure.
 */
export async function compressImageForUpload(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size < 350_000) return file;

  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const mimeType = options.mimeType ?? "image/jpeg";

  try {
    const img = await loadImageFromFile(file);
    const longest = Math.max(img.naturalWidth || 0, img.naturalHeight || 0);
    if (!longest) return file;

    const scale = longest > maxEdge ? maxEdge / longest : 1;
    // Still recompress large files even when already under maxEdge.
    if (scale >= 1 && file.size < 900_000) return file;

    const width = Math.max(1, Math.round((img.naturalWidth || maxEdge) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || maxEdge) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), mimeType, quality);
    });
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    const ext = mimeType === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
