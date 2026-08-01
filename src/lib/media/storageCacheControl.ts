/**
 * Firebase Storage objects in this app use timestamped / unique object names.
 * Long public caching is safe for those immutable object paths + download tokens.
 * Default Firebase metadata is `private, max-age=0`, which forces revalidation
 * and drives repeat egress on remounts / warm navigation.
 */
export const IMMUTABLE_STORAGE_CACHE_CONTROL =
  "public,max-age=31536000,immutable";

export function storageUploadMetadata(contentType: string) {
  return {
    contentType,
    cacheControl: IMMUTABLE_STORAGE_CACHE_CONTROL,
  };
}
