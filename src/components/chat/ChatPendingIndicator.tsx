type Props = {
  className?: string;
};

/** Minimal violet pulse — pending chat activity. */
export default function ChatPendingIndicator({ className = "" }: Props) {
  return (
    <span
      className={`pointer-events-none absolute flex h-[11px] w-[11px] items-center justify-center ${className}`}
      aria-hidden
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500/35" />
      <span className="relative h-[9px] w-[9px] rounded-full bg-gradient-to-br from-violet-400 to-violet-600 shadow-[0_0_10px_rgba(139,92,246,0.85)] ring-[1.5px] ring-[#171717]" />
    </span>
  );
}
