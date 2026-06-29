export type ShuffleProfile = {
  uid: string;
  authUid?: string;
  username: string;
  usernameLower?: string;
  email?: string;
  moderationTag?: string;
  bio: string;
  photo: string;
  coverPhoto?: string;
  coverVideo?: string;
  lastActive?: string;
  presenceAt?: string;
  online?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
  adminBlurGallery?: boolean;
  mediaBlurFlags?: Record<string, boolean>;
  provincia?: string;
  ciudad?: string;
  pais?: string;
  sexo?: string;
  edad?: number;
  intereses?: string[];
  etiquetas?: string[];
  fotos?: string[];
  searchKeywords?: string[];
  historiasActivasCount?: number;
  hasActiveStories?: boolean;
  /** Precomputado al cargar el pool — no recalcular en cada render de fila. */
  showOnline: boolean;
  mostrarUltimaVez?: boolean;
  blurPhoto: boolean;
  /** Perfil destacado con boost activo (prioridad en ventana shuffle). */
  shuffleFeatured?: boolean;
};
