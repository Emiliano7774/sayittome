export type AnonMatchRequestState =
  | "pendiente"
  | "aceptado"
  | "rechazado"
  | "expirado"
  | "cancelado";

export type AnonDirectChatState = "activo" | "cerrado" | "denunciado";

export type AnonMatchRequest = {
  solicitudId: string;
  solicitanteUid: string;
  solicitanteAnonId?: string;
  tipoSolicitud?: "perfil_a_anonimo" | "anon_a_anonimo" | "perfil_a_perfil" | "anon_a_perfil";
  destinatarioTipo?: "perfil" | "anonimo";
  destinatarioUid?: string;
  anonId: string;
  estado: AnonMatchRequestState;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  chatId?: string;
  idioma?: string;
  pais?: string;
  provincia?: string;
};

export type AnonDirectChat = {
  chatId: string;
  tipo: "perfil_con_anonimo" | "anon_con_anonimo" | "perfil_con_perfil" | "anon_con_perfil";
  solicitanteUid: string;
  solicitanteAnonId?: string;
  destinatarioUid?: string;
  anonId: string;
  estado: AnonDirectChatState;
  createdAt: string;
  updatedAt: string;
  ultimoMensaje?: string;
  cerradoPor?: string;
  cerradoAt?: string;
  denunciadoPor?: string;
  denunciadoAt?: string;
};

export const ANON_MATCH_REQUEST_MS = 10_000;
export const ANON_MATCH_ACTIVE_MS = 15 * 60 * 1000;
