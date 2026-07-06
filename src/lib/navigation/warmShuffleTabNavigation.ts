import {
  beginShuffleWarmHandoff,
  isShuffleKeepAliveActive,
} from "@/lib/navigation/shuffleKeepAlive";

/** Begin warm shuffle handoff from the current main-tab path (Chats, Stories, etc.). */
export function beginWarmShuffleTabNavigation(fromPath?: string) {
  if (typeof window === "undefined" || !isShuffleKeepAliveActive()) return false;

  const path =
    fromPath ||
    window.location.pathname.split("?")[0].split("#")[0] ||
    "/chats";

  beginShuffleWarmHandoff(path);
  return true;
}
