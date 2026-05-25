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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black">

      <button
        onClick={onClose}
        className="absolute left-5 top-5 text-6xl text-white"
      >
        ×
      </button>

      <img
        src={url}
        className="max-h-[95vh] max-w-[95vw] object-contain"
      />
    </div>
  );
}
