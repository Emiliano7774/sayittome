type Props = {
  className?: string;
};

/** Minimal orange pulse — pending chat activity. */
export default function ChatPendingIndicator({ className = "" }: Props) {
  return (
    <span
      className={`pointer-events-none absolute flex h-[11px] w-[11px] items-center justify-center ${className}`}
      data-chat-pending-indicator="1"
      aria-hidden
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500/35" />
      <span className="relative h-[9px] w-[9px] rounded-full bg-gradient-to-br from-orange-400 to-amber-600 shadow-[0_0_10px_rgba(249,115,22,0.85)] ring-[1.5px] ring-[#171717]" />
    </span>
  );
}
