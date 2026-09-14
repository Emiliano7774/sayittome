type SecureScreenBridge = {
  enable?: () => void;
  disable?: () => void;
};

type SecureWindow = Window & {
  SayItToMeSecureScreen?: SecureScreenBridge;
};

export function setSecureBombScreen(enabled: boolean) {
  if (typeof window === "undefined") return;

  const bridge = (window as SecureWindow).SayItToMeSecureScreen;
  try {
    if (enabled) bridge?.enable?.();
    else bridge?.disable?.();
  } catch {
    // Web/PWA has no native FLAG_SECURE bridge.
  }
}
