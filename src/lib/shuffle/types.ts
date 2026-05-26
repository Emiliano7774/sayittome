export type ShuffleProfile = {
  uid: string;
  username: string;
  bio: string;
  photo: string;
  lastActive?: string;
  presenceAt?: string;
  online?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
  /** Precomputado al cargar el pool — no recalcular en cada render de fila. */
  showOnline: boolean;
  blurPhoto: boolean;
};
