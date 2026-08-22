"use client";

type Stage = "choose" | "confirm-me" | "confirm-everyone";

type Props = {
  open: boolean;
  canDeleteForEveryone: boolean;
  stage: Stage;
  onChooseMe: () => void;
  onChooseEveryone: () => void;
  onConfirmMe: () => void;
  onConfirmEveryone: () => void;
  onClose: () => void;
  labels: {
    forMe: string;
    forEveryone: string;
    confirmMe: string;
    confirmEveryone: string;
    confirm: string;
    cancel: string;
  };
};

export default function ChatMessageDeleteMenu({
  open,
  canDeleteForEveryone,
  stage,
  onChooseMe,
  onChooseEveryone,
  onConfirmMe,
  onConfirmEveryone,
  onClose,
  labels,
}: Props) {
  if (!open) return null;

  const confirming = stage !== "choose";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={labels.cancel}
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-[#161616] text-white shadow-2xl"
        data-delete-stage={stage}
        data-confirming={confirming ? "true" : "false"}
      >
        {stage === "choose" ? (
          <>
            <button
              type="button"
              className="w-full px-5 py-4 text-left text-base font-semibold"
              onClick={onChooseMe}
            >
              {labels.forMe}
            </button>
            {canDeleteForEveryone ? (
              <button
                type="button"
                className="w-full border-t border-white/10 px-5 py-4 text-left text-base font-semibold text-red-400"
                onClick={onChooseEveryone}
              >
                {labels.forEveryone}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p className="px-5 py-4 text-sm leading-snug text-white/80">
              {stage === "confirm-everyone" ? labels.confirmEveryone : labels.confirmMe}
            </p>
            <button
              type="button"
              className="w-full border-t border-white/10 px-5 py-4 text-left text-base font-semibold text-red-400"
              onClick={stage === "confirm-everyone" ? onConfirmEveryone : onConfirmMe}
            >
              {labels.confirm}
            </button>
          </>
        )}
        <button
          type="button"
          className="w-full border-t border-white/10 px-5 py-4 text-left text-base font-semibold text-white/55"
          onClick={onClose}
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
