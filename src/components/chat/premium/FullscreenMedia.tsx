"use client";

type Props = {
  url: string;
  onClose: () => void;
};

export default function FullscreenMedia({
  url,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
      <button
        onClick={onClose}
        className="absolute left-6 top-6 text-5xl text-white"
      >
        ×
      </button>

      <img
        src={url}
        alt="media"
        className="max-h-[95vh] max-w-[95vw] object-contain"
      />
    </div>
  );
}
