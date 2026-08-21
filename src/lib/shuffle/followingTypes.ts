export type FollowingProfile = {
  uid: string;
  authUid?: string;
  aliasIds?: string[];
  username: string;
  photo: string;
  lastActive?: string;
  online?: boolean;
  showOnline: boolean;
};
