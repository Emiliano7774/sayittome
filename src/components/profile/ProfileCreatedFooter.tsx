type Props = {
  label: string;
  className?: string;
  style?: React.CSSProperties;
};

/** Bottom-right signature at the end of the profile — scrolls with content, not fixed. */
export default function ProfileCreatedFooter({ label, className = "", style }: Props) {
  if (!label) {
    return null;
  }

  return (
    <footer
      className={[
        "pointer-events-none w-full px-6 pb-8 pt-4 text-right italic text-white/35 md:px-10 md:text-sm",
        className,
      ].join(" ")}
      style={style}
    >
      {label}
    </footer>
  );
}
