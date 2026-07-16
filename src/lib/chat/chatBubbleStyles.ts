export function chatBubbleShellClass(
  isClassic: boolean,
  mine: boolean,
  unreadIncoming = false,
) {
  const shape = isClassic
    ? mine
      ? "rounded-lg rounded-br-sm"
      : "rounded-lg rounded-bl-sm"
    : mine
      ? "rounded-[22px] rounded-br-md"
      : "rounded-[22px] rounded-bl-md";

  const size = isClassic
    ? "w-fit max-w-[min(82vw,20rem)] px-3 py-2"
    : "w-fit max-w-[75%] px-4 py-2.5";

  // Chat detail must not paint orange pending borders/rings. Unread UX lives on
  // the bottom-nav badge and chat-list row highlight only.
  void unreadIncoming;
  const colors = mine
    ? isClassic
      ? "bg-violet-600 text-white shadow-[0_0_18px_rgba(139,92,246,0.22)]"
      : "bg-violet-500/80 text-white"
    : isClassic
      ? "border border-white/10 bg-[#111111] text-zinc-200"
      : "bg-[#0c0c0d] text-white";

  return [size, shape, colors, "font-normal"].filter(Boolean).join(" ");
}

export function chatBubbleTextClass(isClassic: boolean, unreadIncoming = false) {
  void unreadIncoming;
  const base = isClassic ? "text-sm leading-snug" : "text-[15px] leading-snug";
  return `${base} font-normal`;
}
