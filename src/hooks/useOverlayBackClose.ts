"use client";

import { useEffect } from "react";

/** Wire a fullscreen overlay to Android/hardware back and body class tracking. */
export function useOverlayBackClose(
  open: boolean,
  onClose: () => void,
  bodyClass: string,
  closeEventName: string,
) {
  useEffect(() => {
    if (!open) return;

    document.body.classList.add(bodyClass);
    const handleClose = () => onClose();
    window.addEventListener(closeEventName, handleClose);

    return () => {
      document.body.classList.remove(bodyClass);
      window.removeEventListener(closeEventName, handleClose);
    };
  }, [bodyClass, closeEventName, onClose, open]);
}
