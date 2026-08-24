/**
 * Admin query username: URLSearchParams already decodes once.
 * Never call decodeURIComponent again — bare "%" (legal in usernames) throws URIError
 * and previously became the pink literal "error".
 */
export function parseAdminUsernameQueryParam(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

export function mapAdminUserChatsFailure(error: unknown): {
  status: number;
  error: string;
  detail?: string;
} {
  const status = Number((error as { status?: number })?.status || 500);
  const code = String((error as Error)?.message || "unknown").trim() || "unknown";
  if (status === 409 || code === "username_not_unique") {
    return { status: 409, error: "username_not_unique" };
  }
  if (status === 400 || code === "username required" || code === "username_required") {
    return { status: 400, error: "username_required" };
  }
  if (
    status === 503 ||
    code === "admin_sdk_unavailable" ||
    code === "datastore_unavailable" ||
    code === "unavailable"
  ) {
    return {
      status: 503,
      error: code === "admin_sdk_unavailable" ? "admin_sdk_unavailable" : "unavailable",
    };
  }
  if (status === 401 || code === "unauthorized" || code === "invalid_auth_token") {
    return { status: 401, error: code === "invalid_auth_token" ? "invalid_auth_token" : "unauthorized" };
  }
  if (status === 403 || code === "forbidden") {
    return { status: 403, error: "forbidden" };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    error: code === "error" ? "unknown" : code,
    detail: code,
  };
}

export function adminUserChatsErrorMessage(code: string) {
  switch (String(code || "").trim()) {
    case "unauthorized":
      return "Sesión admin no válida. Volvé a iniciar sesión.";
    case "forbidden":
      return "Tu cuenta no tiene permiso de admin.";
    case "username_required":
      return "Falta el username del perfil.";
    case "username_not_unique":
      return "Hay varios perfiles con ese username.";
    case "unavailable":
    case "admin_sdk_unavailable":
    case "datastore_unavailable":
      return "Servicio de datos temporalmente no disponible. Reintentá.";
    case "invalid_auth_token":
      return "Token de autenticación inválido. Reintentá.";
    case "http_500":
    case "unknown":
      return "No se pudo cargar el historial. Reintentá.";
    default:
      return code && code !== "error"
        ? `No se pudo cargar el historial (${code}).`
        : "No se pudo cargar el historial. Reintentá.";
  }
}
