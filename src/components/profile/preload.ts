export function preloadImage(
  url?: string,
) {
  if (!url) return;

  const img =
    new Image();

  img.src = url;
}
