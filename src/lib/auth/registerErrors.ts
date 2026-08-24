import type { MessageKey } from "@/lib/i18n/getMessage";

export function normalizeLoginEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function mapRegisterErrorCode(code: string): MessageKey {
  switch (code) {
    case "auth/email-already-in-use":
      return "error_register_email_in_use";
    case "auth/invalid-email":
      return "error_register_invalid_email";
    case "auth/weak-password":
      return "error_register_weak_password";
    case "auth/too-many-requests":
      return "error_register_too_many";
    case "auth/network-request-failed":
      return "error_login_network";
    default:
      return "error_register_generic";
  }
}

/**
 * Login auth codes → copy. Credential failures collapse (no email enumeration).
 */
export function mapLoginErrorCode(code: string): MessageKey {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "error_login_invalid";
    case "auth/invalid-email":
      return "error_register_invalid_email";
    case "auth/too-many-requests":
      return "error_login_too_many";
    case "auth/network-request-failed":
      return "error_login_network";
    case "auth/user-disabled":
      return "error_login_disabled";
    default:
      return "error_login_generic";
  }
}

/**
 * Password-reset failures. user-not-found is treated as success by the UI
 * (callers should not surface it) to avoid account enumeration.
 */
export function mapPasswordResetErrorCode(code: string): MessageKey {
  switch (code) {
    case "auth/invalid-email":
      return "error_register_invalid_email";
    case "auth/too-many-requests":
      return "error_login_too_many";
    case "auth/network-request-failed":
      return "error_login_network";
    case "auth/missing-email":
      return "error_reset_need_email";
    default:
      return "error_reset_generic";
  }
}

/** True when reset should show the neutral “email sent” success (no enumeration). */
export function isPasswordResetEnumeratingMiss(code: string): boolean {
  return (
    code === "auth/user-not-found" ||
    code === "auth/invalid-credential"
  );
}

/** @deprecated Use mapRegisterErrorCode with t() */
export function mapRegisterError(code: string) {
  const keys: Record<string, string> = {
    error_register_email_in_use: "Ya existe una cuenta con ese email.",
    error_register_invalid_email: "El email no es válido.",
    error_register_weak_password: "La contraseña debe tener al menos 6 caracteres.",
    error_register_too_many: "Demasiados intentos. Esperá unos minutos.",
    error_register_generic: "No se pudo crear la cuenta. Probá de nuevo.",
  };
  return keys[mapRegisterErrorCode(code)] || keys.error_register_generic;
}

/** @deprecated Use mapLoginErrorCode with t() */
export function mapLoginError(code: string) {
  const keys: Record<string, string> = {
    error_login_invalid:
      "Email o contraseña incorrectos. Revisá los datos o restablecé la contraseña.",
    error_login_too_many: "Demasiados intentos. Esperá unos minutos e intentá de nuevo.",
    error_login_network: "Sin conexión. Revisá tu red e intentá de nuevo.",
    error_login_disabled: "Esta cuenta está deshabilitada.",
    error_login_generic: "No se pudo iniciar sesión. Probá de nuevo.",
  };
  return keys[mapLoginErrorCode(code)] || keys.error_login_generic;
}
