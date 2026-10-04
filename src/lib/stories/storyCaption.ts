export function storyCaptionText(
  story?: { texto?: string | null } | null,
) {
  return String(story?.texto || "").trim();
}

export function shouldShowStoryMediaCaption(
  story?: { texto?: string | null; mediaUrl?: string | null } | null,
) {
  return Boolean(String(story?.mediaUrl || "").trim() && storyCaptionText(story));
}
