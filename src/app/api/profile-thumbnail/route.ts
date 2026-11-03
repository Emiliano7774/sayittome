import sharp from "profile-image-codec";
import {
  canonicalPublicProfilePhoto,
  PROFILE_THUMB_WIDTHS,
} from "@/lib/media/profileThumbnail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Firebase SSR runs with 512 MiB. Bound libvips workers and memory cache so
// several visible Shuffle avatars can transform without evicting the app.
sharp.concurrency(2);
sharp.cache({ memory: 24, files: 0, items: 40 });

const MAX_ORIGINAL_BYTES = 24 * 1024 * 1024;
const MAX_INPUT_PIXELS = 30_000_000;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;

function failure(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * Public, token-authorized profile thumbnails. Designed for Firebase Hosting's
 * framework adapter, whose /_next/image endpoint rejects Storage remote URLs.
 * This does NOT use Admin SDK, read private objects or proxy arbitrary URLs.
 */
export async function GET(request: Request): Promise<Response> {
  const started = performance.now();
  let raw: URL;
  try {
    raw = new URL(request.url);
  } catch {
    return failure(400);
  }
  const source = canonicalPublicProfilePhoto(raw.searchParams.get("u") || "");
  const width = Number(raw.searchParams.get("w"));
  if (!source || !PROFILE_THUMB_WIDTHS.includes(width as (typeof PROFILE_THUMB_WIDTHS)[number])) {
    return failure(400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(source, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(11_000),
      headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8" },
    });
  } catch {
    return failure(502);
  }
  if (!upstream.ok || !upstream.body) return failure(upstream.status === 404 ? 404 : 502);

  const declaredSize = Number(upstream.headers.get("content-length") || 0);
  if (declaredSize > MAX_ORIGINAL_BYTES) {
    await upstream.body.cancel().catch(() => {});
    return failure(413);
  }
  const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "application/octet-stream"].includes(type)) {
    await upstream.body.cancel().catch(() => {});
    return failure(415);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const reader = upstream.body.getReader();
    while (true) {
      const { value: part, done } = await reader.read();
      if (done) break;
      total += part.length;
      if (total > MAX_ORIGINAL_BYTES) {
        await reader.cancel().catch(() => {});
        return failure(413);
      }
      chunks.push(part);
    }
  } catch {
    return failure(502);
  }
  if (total < 20) return failure(415);

  try {
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)), total);
    const picture = sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
      failOn: "warning",
    });
    const metadata = await picture.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) {
      return failure(415);
    }
    const result = await picture
      .rotate()
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .webp({ quality: width <= 384 ? 76 : 78, effort: 3 })
      .toBuffer();
    if (!result.length || result.length > MAX_RESULT_BYTES) return failure(422);

    return new Response(new Uint8Array(result), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "X-Photo-Source-Bytes": String(total),
        "X-Photo-Result-Bytes": String(result.length),
        "Server-Timing": `thumb;dur=${(performance.now() - started).toFixed(1)}`,
      },
    });
  } catch {
    return failure(422);
  }
}
