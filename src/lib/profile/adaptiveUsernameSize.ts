import { useEffect, useState } from "react";

/** Rough width estimate for uppercase/black display names. */
function estimateUsernameWidthPx(username: string, fontSizePx: number) {
  return username.length * fontSizePx * 0.52;
}

export function resolveAdaptiveUsernameFontSize(
  username: string,
  baseSizePx: number,
  viewportWidthPx: number,
  sidePaddingPx = 64,
  minSizePx = 28,
) {
  const available = Math.max(180, viewportWidthPx - sidePaddingPx);
  const estimated = estimateUsernameWidthPx(username, baseSizePx);

  if (estimated <= available) {
    return baseSizePx;
  }

  return Math.max(minSizePx, Math.floor(baseSizePx * (available / estimated)));
}

export function useAdaptiveUsernameFontSize(
  username: string,
  baseSizePx: number,
  sidePaddingPx = 64,
) {
  const [fontSizePx, setFontSizePx] = useState(baseSizePx);

  useEffect(() => {
    function update() {
      setFontSizePx(
        resolveAdaptiveUsernameFontSize(
          username,
          baseSizePx,
          window.innerWidth,
          sidePaddingPx,
        ),
      );
    }

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [username, baseSizePx, sidePaddingPx]);

  return `${fontSizePx}px`;
}
