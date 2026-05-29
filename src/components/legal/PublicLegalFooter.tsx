import Link from "next/link";

type Props = {
  className?: string;
};

export default function PublicLegalFooter({ className = "" }: Props) {
  return (
    <footer
      className={`border-t border-white/10 pt-6 text-center text-sm text-white/45 ${className}`}
    >
      <Link
        href="/privacy"
        className="font-semibold text-violet-300 transition hover:text-violet-200"
      >
        Privacy Policy
      </Link>
    </footer>
  );
}
