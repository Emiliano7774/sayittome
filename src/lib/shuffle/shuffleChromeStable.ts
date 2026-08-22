import {
  getClassicShuffleHeaderUi,
  type ClassicShuffleHeaderUi,
} from "@/lib/shuffle/classicHeaderUi";
import type { ClassicShuffleDensity } from "@/lib/shuffle/classicDensity";
import type { FollowingProfile } from "@/lib/shuffle/followingTypes";
import type { AnonCardSnapshot, FollowingSnapshot } from "@/lib/shuffle/shuffleChromeCache";

export type FollowingChromeDecision = {
  hasSession: boolean;
  profiles: FollowingProfile[];
  showSkeleton: boolean;
  showGuest: boolean;
  state: "guest" | "skeleton" | "rows" | "empty";
};

export type AnonCardChromeDecision = {
  visibility: "hidden" | "reserved" | "show";
  hiddenForActiveChat: boolean;
  isIncognitoVisitor: boolean;
  isProfileUser: boolean;
  searching: boolean;
  uid: string;
  state: "hidden" | "reserved" | "show";
};

export type ShuffleChromeSlotBox = {
  marginTop: number;
  marginBottom: number;
  paddingTop: number;
  paddingBottom: number;
  minHeight: number;
  height: number;
  overflow: "hidden" | "visible";
  borderTopWidth: number;
  borderBottomWidth: number;
};

export type ShuffleChromeSlotMeasure = {
  offsetHeight: number;
  layoutPx: number;
};

export type ShuffleChromeLayout = {
  followingSlotPx: number;
  followingBodyPx: number;
  anonSlotPx: number;
  feedOffsetPx: number;
};

function scopedFollowingCache(
  uid: string,
  cached: FollowingSnapshot | null | undefined,
) {
  if (!uid || !cached || cached.uid !== uid) return null;
  return cached;
}

function scopedAnonCache(uid: string, cached: AnonCardSnapshot | null | undefined) {
  if (!uid || !cached || cached.uid !== uid) return null;
  return cached;
}

export function followingBodyHeightPx(ui: ClassicShuffleHeaderUi) {
  return ui.followingBodyPx;
}

export function followingSlotHeightPx(ui: ClassicShuffleHeaderUi) {
  return ui.followingSlotPx;
}

export function anonSlotHeightPx(ui: ClassicShuffleHeaderUi) {
  return ui.anonSlotPx;
}

export function classicFollowingSlotStyles(
  ui: ClassicShuffleHeaderUi,
): ShuffleChromeSlotBox {
  return {
    marginTop: ui.followingMtPx,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: ui.followingPbPx,
    minHeight: ui.followingSlotPx,
    height: ui.followingSlotPx,
    overflow: "hidden",
    borderTopWidth: 0,
    borderBottomWidth: 1,
  };
}

export function classicAnonSlotStyles(
  ui: ClassicShuffleHeaderUi,
  occupy: boolean,
  options?: { incognito?: boolean },
): ShuffleChromeSlotBox {
  if (!occupy) {
    return {
      marginTop: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      minHeight: 0,
      height: 0,
      overflow: "hidden",
      borderTopWidth: 0,
      borderBottomWidth: 0,
    };
  }
  const slotPx = options?.incognito ? ui.anonIncognitoSlotPx : ui.anonSlotPx;
  return {
    marginTop: ui.anonMtPx,
    marginBottom: ui.anonMbPx,
    paddingTop: ui.anonPtPx,
    paddingBottom: 0,
    minHeight: slotPx,
    height: slotPx,
    overflow: "hidden",
    borderTopWidth: 1,
    borderBottomWidth: 0,
  };
}

export function measureSlotBox(styles: ShuffleChromeSlotBox): ShuffleChromeSlotMeasure {
  const offsetHeight = styles.minHeight;
  return {
    offsetHeight,
    layoutPx: styles.marginTop + offsetHeight + styles.marginBottom,
  };
}

export function decideFollowingChrome(input: {
  authPending: boolean;
  uid: string;
  cached: FollowingSnapshot | null;
  liveProfiles: FollowingProfile[] | null;
  liveReady: boolean;
}): FollowingChromeDecision {
  const uid = String(input.uid || "").trim();
  const cached = scopedFollowingCache(uid, input.cached);
  const liveProfiles = uid ? input.liveProfiles : null;

  if (!uid) {
    if (input.authPending) {
      return {
        hasSession: false,
        profiles: [],
        showSkeleton: true,
        showGuest: false,
        state: "skeleton",
      };
    }
    return {
      hasSession: false,
      profiles: [],
      showSkeleton: false,
      showGuest: true,
      state: "guest",
    };
  }

  if (input.authPending) {
    const profiles = liveProfiles || cached?.profiles || [];
    if (profiles.length > 0) {
      return {
        hasSession: true,
        profiles,
        showSkeleton: false,
        showGuest: false,
        state: "rows",
      };
    }
    return {
      hasSession: true,
      profiles: [],
      showSkeleton: true,
      showGuest: false,
      state: "skeleton",
    };
  }

  const profiles = input.liveReady
    ? liveProfiles || []
    : liveProfiles || cached?.profiles || [];

  if (!input.liveReady && profiles.length === 0) {
    return {
      hasSession: true,
      profiles: [],
      showSkeleton: true,
      showGuest: false,
      state: "skeleton",
    };
  }

  if (profiles.length === 0) {
    return {
      hasSession: true,
      profiles: [],
      showSkeleton: false,
      showGuest: false,
      state: "empty",
    };
  }

  return {
    hasSession: true,
    profiles,
    showSkeleton: false,
    showGuest: false,
    state: "rows",
  };
}

export function decideAnonCardChrome(input: {
  authPending: boolean;
  uid?: string;
  cached: AnonCardSnapshot | null;
  hasActiveDirectChat: boolean;
  isProfileUser: boolean;
  isIncognitoVisitor: boolean;
  searching: boolean;
}): AnonCardChromeDecision {
  const uid = String(input.uid || "").trim();
  const cached = scopedAnonCache(uid, input.cached);

  if (!input.authPending && input.hasActiveDirectChat) {
    return {
      visibility: "hidden",
      hiddenForActiveChat: true,
      isIncognitoVisitor: input.isIncognitoVisitor,
      isProfileUser: input.isProfileUser,
      searching: input.searching,
      uid,
      state: "hidden",
    };
  }

  if (input.authPending && cached?.hiddenForActiveChat) {
    return {
      visibility: "hidden",
      hiddenForActiveChat: true,
      isIncognitoVisitor: Boolean(cached.isIncognitoVisitor),
      isProfileUser: Boolean(cached.isProfileUser),
      searching: Boolean(cached.searching),
      uid,
      state: "hidden",
    };
  }

  if (!input.authPending && !input.isProfileUser && !input.isIncognitoVisitor) {
    return {
      visibility: "hidden",
      hiddenForActiveChat: false,
      isIncognitoVisitor: false,
      isProfileUser: false,
      searching: false,
      uid,
      state: "hidden",
    };
  }

  if (input.authPending) {
    if (cached?.show) {
      return {
        visibility: "show",
        hiddenForActiveChat: false,
        isIncognitoVisitor: Boolean(
          input.isIncognitoVisitor || cached.isIncognitoVisitor,
        ),
        isProfileUser: Boolean(cached.isProfileUser),
        searching: Boolean(cached.searching),
        uid,
        state: "show",
      };
    }
    return {
      visibility: "reserved",
      hiddenForActiveChat: false,
      isIncognitoVisitor: Boolean(
        input.isIncognitoVisitor || cached?.isIncognitoVisitor,
      ),
      isProfileUser: Boolean(cached?.isProfileUser || uid),
      searching: Boolean(cached?.searching),
      uid,
      state: "reserved",
    };
  }

  return {
    visibility: "show",
    hiddenForActiveChat: false,
    isIncognitoVisitor: input.isIncognitoVisitor,
    isProfileUser: input.isProfileUser,
    searching: input.searching,
    uid,
    state: "show",
  };
}

export function resolveAnonReservePx(input: {
  density: ClassicShuffleDensity;
  incognito: boolean;
}) {
  const ui = getClassicShuffleHeaderUi(input.density);
  return input.incognito ? ui.anonIncognitoSlotPx : ui.anonSlotPx;
}

export function commitAnonSlotHeight(input: {
  previousPx: number | null;
  density: ClassicShuffleDensity;
  authPending: boolean;
  visibility: AnonCardChromeDecision["visibility"];
  hiddenForActiveChat: boolean;
  incognito?: boolean;
}) {
  const reservedPx = resolveAnonReservePx({
    density: input.density,
    incognito: Boolean(input.incognito),
  });
  if (input.previousPx != null) return input.previousPx;
  if (input.visibility === "show" || input.visibility === "reserved") {
    return reservedPx;
  }
  if (input.hiddenForActiveChat) return 0;
  if (input.authPending) return reservedPx;
  return 0;
}

export function committedShuffleChromeLayout(input: {
  density: ClassicShuffleDensity;
  anonOccupy: boolean;
  incognito?: boolean;
}): ShuffleChromeLayout {
  const ui = getClassicShuffleHeaderUi(input.density);
  const following = measureSlotBox(classicFollowingSlotStyles(ui));
  const anon = measureSlotBox(
    classicAnonSlotStyles(ui, input.anonOccupy, { incognito: input.incognito }),
  );
  return {
    followingSlotPx: ui.followingSlotPx,
    followingBodyPx: ui.followingBodyPx,
    anonSlotPx: input.anonOccupy
      ? input.incognito
        ? ui.anonIncognitoSlotPx
        : ui.anonSlotPx
      : 0,
    feedOffsetPx: following.layoutPx + anon.layoutPx,
  };
}

export function chromeLayoutShift(
  before: ShuffleChromeLayout,
  after: ShuffleChromeLayout,
) {
  return Math.abs(before.feedOffsetPx - after.feedOffsetPx);
}

export function createShuffleChromeMount(density: ClassicShuffleDensity) {
  let previousAnonPx: number | null = null;
  const ui = getClassicShuffleHeaderUi(density);

  return {
    paint(input: {
      authPending: boolean;
      following: FollowingChromeDecision;
      anon: AnonCardChromeDecision;
    }) {
      const committedPx = commitAnonSlotHeight({
        previousPx: previousAnonPx,
        density,
        authPending: input.authPending,
        visibility: input.anon.visibility,
        hiddenForActiveChat: input.anon.hiddenForActiveChat,
        incognito: input.anon.isIncognitoVisitor,
      });
      previousAnonPx = committedPx;
      const occupy = committedPx > 0;
      const following = measureSlotBox(classicFollowingSlotStyles(ui));
      const anon = measureSlotBox(
        classicAnonSlotStyles(ui, occupy, {
          incognito: input.anon.isIncognitoVisitor,
        }),
      );
      return {
        following,
        anon,
        occupy,
        committedPx,
        followingState: input.following.state,
        anonState: input.anon.state,
        feedOffsetPx: following.layoutPx + anon.layoutPx,
      };
    },
  };
}
