import type { MessageKey } from "@/lib/i18n/getMessage";

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
    default:
      return "error_register_generic";
  }
}

export function mapLoginErrorCode(code: string): MessageKey {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "error_login_invalid";
    case "auth/user-not-found":
      return "error_login_not_found";
    case "auth/too-many-requests":
      return "error_register_too_many";
    default:
      return "error_login_generic";
  }
}

/** @deprecated Use mapRegisterErrorCode with t() */
export function mapRegisterError(code: string) {
  const keys: Record<string, string> = {
    "error_register_email_in_use": "Ya existe una cuenta con ese email.",
    "error_register_invalid_email": "El email no es válido.",
    "error_register_weak_password": "La contraseña debe tener al menos 6 caracteres.",
    "error_register_too_many": "Demasiados intentos. Esperá unos minutos.",
    "error_register_generic": "No se pudo crear la cuenta. Probá de nuevo.",
  };
  return keys[mapRegisterErrorCode(code)] || keys.error_register_generic;
}

/** @deprecated Use mapLoginErrorCode with t() */
export function mapLoginError(code: string) {
  const keys: Record<string, string> = {
    "error_login_invalid": "Email o contraseña incorrectos.",
    "error_login_not_found": "No existe una cuenta con ese email.",
    "error_register_too_many": "Demasiados intentos. Esperá unos minutos.",
    "error_login_generic": "No se pudo iniciar sesión.",
  };
  return keys[mapLoginErrorCode(code)] || keys.error_login_generic;
}
