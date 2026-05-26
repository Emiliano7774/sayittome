export const ANON_LEGAL_ACCEPT_KEY = "sayittome_anon_legal_accepted_v1";

export const ANON_ENTRY_INTRO =
  "Vas a entrar en modo anónimo. Tu identidad pública no se muestra a otros usuarios, pero la app puede conservar registros técnicos de seguridad.";

export const ANON_LEGAL_BULLETS = [
  {
    id: "sesion",
    title: "Sesión temporal",
    body: "Lo que hagas en modo anónimo se guarda solo mientras dura esta sesión. Si cerrás la pestaña, volvés al inicio o entrás anónimo de nuevo, se descarta tu identidad anterior, desaparecen esos chats de tu vista y se abre otra identidad nueva. Si hablás otra vez con la misma persona, será un chat distinto y no sabrá quién sos.",
  },
  {
    id: "edad",
    title: "Edad mínima",
    body: "Debés tener al menos 13 años o la edad mínima exigida por las leyes de tu país.",
  },
  {
    id: "anonimato",
    title: "Anonimato parcial",
    body: "El anonimato protege tu identidad frente a otros usuarios, pero no significa impunidad absoluta.",
  },
  {
    id: "seguridad",
    title: "Seguridad y moderación",
    body: "Para prevenir abuso, acoso, grooming, amenazas, explotación sexual de menores u otros delitos, la app puede conservar IP, user-agent, huellas anónimas, horarios, chats asociados y registros de actividad.",
  },
  {
    id: "responsabilidad",
    title: "Responsabilidad personal",
    body: "Interactuás con personas reales. Sos responsable de tus mensajes, archivos, historias y decisiones dentro de la plataforma.",
  },
  {
    id: "ilegal",
    title: "Contenido ilegal",
    body: "El contenido ilegal o riesgoso puede ser moderado, preservado como evidencia técnica y entregado ante un requerimiento legal válido.",
  },
] as const;

export const ANON_LEGAL_DECLARATION =
  "Entiendo cómo funciona la aplicación, declaro tener edad suficiente y acepto actuar bajo mi responsabilidad, con los riesgos y consecuencias positivas o negativas que puedan existir.";

export function hasAnonLegalAcceptance() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(ANON_LEGAL_ACCEPT_KEY) === "1";
}

export function setAnonLegalAcceptance() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ANON_LEGAL_ACCEPT_KEY, "1");
}

export function clearAnonLegalAcceptance() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ANON_LEGAL_ACCEPT_KEY);
}
