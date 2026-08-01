type CompressOptions = {
  maxEdge?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp" | "image/png";
};

function isProbablyAnimatedGif(file: File) {
  return file.type === "image/gif";
}

function chooseOutputMime(
  file: File,
  preferred?: CompressOptions["mimeType"],
): "image/jpeg" | "image/webp" | "image/png" {
  if (preferred) return preferred;
  if (file.type === "image/png") return "image/webp";
  if (file.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

async function decodeImageBitmap(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      // Prefer EXIF orientation correction when the browser supports it.
      return await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
    } catch {
      return createImageBitmap(file);
    }
  }
  return null;
}

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
 * - Skips non-images, GIF, HEIC/HEIF (no reliable canvas encode), and tiny files.
 * - Preserves transparency via webp when source is PNG.
 * - Falls back to the original File on any failure.
 * Does not create separate thumbnail objects.
 */
export async function compressImageForUpload(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (isProbablyAnimatedGif(file)) return file;
  if (file.type === "image/heic" || file.type === "image/heif") return file;
  if (file.size < 350_000) return file;

  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const mimeType = chooseOutputMime(file, options.mimeType);

  try {
    const bitmap = await decodeImageBitmap(file);
    const img = bitmap ? null : await loadImageFromFile(file);
    const sourceWidth = bitmap?.width || img?.naturalWidth || 0;
    const sourceHeight = bitmap?.height || img?.naturalHeight || 0;
    const longest = Math.max(sourceWidth, sourceHeight);
    if (!longest) {
      bitmap?.close();
      return file;
    }

    const scale = longest > maxEdge ? maxEdge / longest : 1;
    if (scale >= 1 && file.size < 900_000) {
      bitmap?.close();
      return file;
    }

    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap?.close();
      return file;
    }

    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
    } else if (img) {
      ctx.drawImage(img, 0, 0, width, height);
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), mimeType, quality);
    });
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    const ext =
      mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
    return new File([blob], `${base}.${ext}`, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
