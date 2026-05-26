export function mapRegisterError(code: string) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con ese email.";
    case "auth/invalid-email":
      return "El email no es válido.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Esperá unos minutos.";
    default:
      return "No se pudo crear la cuenta. Probá de nuevo.";
  }
}

export function mapLoginError(code: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Email o contraseña incorrectos.";
    case "auth/user-not-found":
      return "No existe una cuenta con ese email.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Esperá unos minutos.";
    default:
      return "No se pudo iniciar sesión.";
  }
}
