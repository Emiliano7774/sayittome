import { logger } from "firebase-functions";

import { db } from "./adminApp";
import { sendStoryPush, storyPairAllows } from "./storyPush";
import { storyUploadNotificationCopy, storyUploadOpenHref } from "./storyNotificationPolicy";

const MAX_FOLLOWERS = 400;
const SEND_CHUNK = 20;

function asId(value: unknown) {
  return String(value || "").trim();
}

export async function handleStoryCreated(input: {
  storyId: string;
  data: Record<string, unknown>;
}) {
  const storyId = asId(input.storyId);
  const ownerUid = asId(input.data.ownerUid || input.data.uid);
  const username = asId(input.data.ownerUsername);
  const anonymous =
    input.data.isAnonymousStory === true || ownerUid.startsWith("anon_");
  if (!storyId || !ownerUid || anonymous) return { notified: 0 };

  const ownerRef = db().collection("usuarios").doc(ownerUid);
  const [followersSnap, followingSnap] = await Promise.all([
    ownerRef.collection("seguidores").limit(MAX_FOLLOWERS).get(),
    ownerRef.collection("siguiendo").limit(MAX_FOLLOWERS).get(),
  ]);

  const followerUids = [
    ...new Set(
      [...followersSnap.docs, ...followingSnap.docs]
        .map((docSnap) => asId(docSnap.id))
        .filter((uid) => uid && uid !== ownerUid),
    ),
  ];

  const copy = storyUploadNotificationCopy(username);
  const href = storyUploadOpenHref(ownerUid, storyId);
  let notified = 0;

  for (let i = 0; i < followerUids.length; i += SEND_CHUNK) {
    const chunk = followerUids.slice(i, i + SEND_CHUNK);
    const results = await Promise.all(
      chunk.map(async (followerUid) => {
        if (!(await storyPairAllows("followingUploads", ownerUid, followerUid))) {
          return 0;
        }
        const sent = await sendStoryPush({
          recipientUid: followerUid,
          title: copy.title,
          body: copy.body,
          href,
          type: "story_upload",
          tag: `story-upload-${storyId}-${followerUid}`,
        });
        return sent.sent > 0 ? 1 : 0;
      }),
    );
    notified += results.reduce((sum: number, value) => sum + value, 0);
  }

  logger.info("story upload push", { storyId, ownerUid, followers: followerUids.length, notified });
  return { notified };
}
