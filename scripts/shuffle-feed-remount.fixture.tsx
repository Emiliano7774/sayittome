import { useEffect, useRef, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import ShuffleFeedWithNativeAds from "@/components/shuffle/ShuffleFeedWithNativeAds";
import { shuffleProfileIdentityKey } from "@/lib/shuffle/dedupeProfiles";
import {
  flushShuffleSlotsSync,
  getShuffleWindowGeneration,
  setShuffleSlotsWithFeatured,
} from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type HarnessProfile = Pick<
  ShuffleProfile,
  "uid" | "authUid" | "username" | "photo" | "bio" | "showOnline" | "blurPhoto"
>;

declare global {
  interface Window {
    __shuffleRemount: {
      paint: (profiles: HarnessProfile[], forceReplace: boolean) => void;
      generation: () => number;
      mountCounts: () => Record<string, number>;
    };
  }
}

const mountCounts: Record<string, number> = {};

const rowStyle: CSSProperties = {
  height: 72,
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  display: "flex",
  alignItems: "center",
  padding: "0 16px",
  contain: "layout paint style",
};

function Row({ profile }: { profile: ShuffleProfile }) {
  const identity =
    shuffleProfileIdentityKey(profile) || `${profile.uid}-${profile.username}`;
  const mountId = useRef(`${identity}:${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    mountCounts[identity] = (mountCounts[identity] || 0) + 1;
  }, [identity]);

  return (
    <div
      data-shuffle-row=""
      data-identity={identity}
      data-mount-id={mountId.current}
      style={rowStyle}
    >
      {profile.username}
    </div>
  );
}

function Feed() {
  return (
    <ShuffleFeedWithNativeAds
      mode="classic"
      variant="list"
      renderProfile={(profile) => {
        const identity =
          shuffleProfileIdentityKey(profile) || `${profile.uid}-${profile.username}`;
        return <Row key={identity} profile={profile} />;
      }}
    />
  );
}

function toShuffleProfile(profile: HarnessProfile): ShuffleProfile {
  return {
    uid: profile.uid,
    authUid: profile.authUid,
    username: profile.username,
    photo: profile.photo || "",
    bio: profile.bio || "bio",
    showOnline: profile.showOnline === true,
    blurPhoto: profile.blurPhoto === true,
  };
}

const host = document.getElementById("root");
if (!host) throw new Error("missing #root");
const root = createRoot(host);
root.render(<Feed />);

window.__shuffleRemount = {
  paint(profiles, forceReplace) {
    const next = profiles.map(toShuffleProfile);
    setShuffleSlotsWithFeatured(next, [], new Int32Array(0), 0, forceReplace);
    flushShuffleSlotsSync();
  },
  generation() {
    return getShuffleWindowGeneration();
  },
  mountCounts() {
    return { ...mountCounts };
  },
};
