"use client";

type Props = {
  url: string;
  mediaType?: "image" | "video";
  secure?: boolean;
  onClose: () => void;
};

export default function FullscreenMedia({
  url,
  mediaType = "image",
  secure = false,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black"
      onContextMenu={(event) => event.preventDefault()}
      style={{ touchAction: secure ? "none" : "auto", userSelect: "none" }}
    >
      <button
        onClick={onClose}
        className="absolute left-5 top-5 z-10 text-6xl text-white"
        aria-label="Cerrar"
      >
        ×
      </button>
      {mediaType === "video" ? (
        <video
          src={url}
          controls={!secure}
          autoPlay
          playsInline
          disablePictureInPicture={secure}
          controlsList={secure ? "nodownload noplaybackrate noremoteplayback nofullscreen" : undefined}
          preload="auto"
          onContextMenu={(event) => event.preventDefault()}
          onDoubleClick={(event) => event.preventDefault()}
          onClick={
            secure
              ? (event) => {
                  const video = event.currentTarget;
                  if (video.paused) void video.play();
                  else video.pause();
                }
              : undefined
          }
          className="max-h-screen max-w-screen object-contain"
        />
      ) : (
        <img
          src={url}
          alt=""
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
          className="max-h-screen max-w-screen object-contain"
        />
      )}
    </div>
  );
}
