import { isInvalidPublicStoryUsername } from "@/lib/stories/storyAuthor";

export async function resolveStoryProfileUsername(input: {
  ownerUid: string;
  fallbackUsername: string;
}) {
  const ownerUid = String(input.ownerUid || "").trim();
  const fallbackUsername = String(input.fallbackUsername || "").trim();

  if (ownerUid && !ownerUid.startsWith("anon_")) {
    try {
      const response = await fetch(
        `/api/profile/resolve-uid?uid=${encodeURIComponent(ownerUid)}&ts=${Date.now()}`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => null);
      const username = String(json?.username || "").trim();
      if (response.ok && username && !isInvalidPublicStoryUsername(username)) {
        return username;
      }
    } catch (error) {
      console.error("story profile uid resolution", error);
    }

    // A stable uid was available, so never navigate using a potentially stale
    // username stored in an old story snapshot.
    return "";
  }

  return fallbackUsername && !isInvalidPublicStoryUsername(fallbackUsername)
    ? fallbackUsername
    : "";
}
