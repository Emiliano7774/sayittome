"use client";

import {
  ArrowUp,
  Bomb,
  Camera,
  Image as ImageIcon,
  Send,
  Video,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import ChatAudioHoldLockMic from "@/components/chat/ChatAudioHoldLockMic";
import ChatAudioPlayer from "@/components/chat/ChatAudioPlayer";
import ChatMessageDeleteMenu from "@/components/chat/ChatMessageDeleteMenu";
import ChatMessageLongPress from "@/components/chat/ChatMessageLongPress";
import ChatSwipeRevealTime from "@/components/chat/ChatSwipeRevealTime";
import FullscreenMedia from "@/components/chat/media/FullscreenMedia";
import { uploadChatMessageMedia, isChatMediaStorageUnauthorized } from "@/lib/media/upload";
import {
  classifyChatMediaFailure,
  CHAT_FILE_INPUT_CLASS,
  ensureChatCameraStreamPermission,
  fileFromChatInput,
  isNativeChatShell,
  openChatFileInput,
} from "@/lib/media/chatMediaCapture";
import {
  CHAT_AUDIO_MIN_BYTES,
  classifyChatAudioCaptureFailure,
  pickSupportedAudioMimeType,
  reduceChatAudioEvent,
  type ChatAudioPhase,
} from "@/lib/media/chatAudioCapture";
import {
  captureTrustedChatAudioStream,
  ensureChatMicrophonePermission,
  noticeAfterMicrophoneResume,
  noticeFromCaptureFailure,
  noticeFromMicrophonePermission,
  openChatMicrophoneSettings,
  planChatMicrophoneStart,
  subscribeChatMicrophonePermissionRefresh,
  type ChatMicrophonePermissionState,
  type ChatMicNotice,
} from "@/lib/media/chatMicrophonePermission";
import { preparePlayableChatAudio } from "@/lib/media/chatAudioPlayback";
import { canOpenViewOnce, markOpened } from "@/lib/media/viewOnce";
import AbuseProtectionMenu from "@/components/chat/AbuseProtectionMenu";
import ChatMessageReceipt from "@/components/chat/ChatMessageReceipt";
import ChatMessageText from "@/components/chat/ChatMessageText";
import ChatOfficialProfileVerifiedBadge from "@/components/chat/ChatOfficialProfileVerifiedBadge";
import ClassicAnonPresenceBubble from "@/components/chat/ClassicAnonPresenceBubble";
import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import { useUxMode } from "@/contexts/UxModeContext";
import { useMainTabShell } from "@/contexts/MainTabShellContext";
import { useNavUsefulPaint } from "@/hooks/useNavUsefulPaint";
import { findActiveAbuseBlock } from "@/lib/abuse/anonAbuseBlocks";
import { getVisitorId } from "@/lib/abuse/fingerprint";
import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import { rememberOwnThreadAnonId, rootAnonContinuityId } from "@/lib/chat/threadAnonContinuity";
import {
  findAnonIdentityChangeInsertIndex,
  getAnonSessionVersion,
  messageAnonSenderId,
  resolveAnonIdentityDividerIndex,
  resolveProfileChatAnonIdentity,
  shouldShowAnonIdentityDivider,
  shouldShowAnonIdentityGuide,
  subscribeAnonSession,
} from "@/lib/chat/anonIdentity";
import { chatHasActivity, deleteEmptyChatIfIdle } from "@/lib/chat/migrate";
import { resolveMessageReceiptStatus } from "@/lib/chat/messageReceipt";
import { unregisterSessionChat, registerSessionChat, getSessionChatIds } from "@/lib/chat/sessionChats";
import {
  buildProfileAnonViewerContext,
  inferOwnerViewingFromAuthors,
  isProfileReplyAuthorId,
  isProfileThreadOwner,
  mapFirestoreDocsToProfileAnonMessages,
  profileAuthUid,
  profileReplyAuthorId,
  remapProfileAnonMessagesMine,
  resolveProfileAnonMessageMine,
  type ProfileAnonFirestoreMessage,
} from "@/lib/chat/profileAnonMessageAuthor";
import { recordAuthorshipProbe } from "@/lib/chat/authorshipProbe";
import {
  buildAuthorshipIncidentRow,
  explainMineDecision,
  recordAuthorshipIncident,
  redactChatId,
} from "@/lib/chat/authorshipIncident";
import {
  readCachedViewerIdentity,
  resolveCanonicalViewerIdentity,
  writeCachedViewerIdentity,
} from "@/lib/chat/viewerIdentityCache";
import { buildCanonicalSender, isRoleIdentityReady } from "@/lib/chat/canonicalSender";
import { applyAuthorshipCorrections } from "@/lib/chat/authorshipCorrections";
import { PersistIdentityError } from "@/lib/chat/persistAnonMessage";
import {
  CHAT_THREAD_COLUMN_CLASS,
  CHAT_THREAD_COMPOSER_CLASS,
  CHAT_THREAD_HEADER_CLASS,
  CHAT_THREAD_INTRO_CLASS,
  CHAT_THREAD_SCROLLER_CLASS,
  CLASSIC_INTRO_INNER_CLASS,
  MODERN_INTRO_INNER_CLASS,
  resolveAnonChatThreadIntro,
  shouldAutoscrollChatThread,
} from "@/lib/chat/chatThreadLayout";
import { useAuth } from "@/contexts/AuthContext";
import { isChatThreadRoute } from "@/lib/navigation/routeKind";
import type { InboxChat } from "@/hooks/useChatsInbox";
import { isProfileAnonMessageUnreadForViewer } from "@/lib/chat/incomingChatActivity";
import {
  inboxChatFromFirestore,
  markThreadReadExact,
} from "@/lib/chat/unread";
import {
  isExactActiveDetailThread,
  resolveDetailReadMark,
  resolveLeaveThreadRead,
} from "@/lib/chat/shouldMarkThreadRead";
import {
  formatAnonSessionLabel,
} from "@/lib/chat/inboxPeerTitle";
import { messageRequiresBlur, profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import { scanUploadFile } from "@/lib/moderation/scanMedia";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import {
  armVerifiedProfileLinkClaimRetry,
  scheduleVerifiedProfileLinkClaimRetry,
} from "@/lib/profile/verifiedProfileLinkClaimRetry";
import { maybeClaimVerifiedProfileLink } from "@/lib/profile/verifiedProfileLinkTicket";
import { getCachedProfile, setCachedProfile, getCachedFullProfile } from "@/lib/profile/profileCache";
import {
  cachedMessageToUi,
  readCachedChatMessages,
  uiMessageToCached,
  writeCachedChatMessages,
} from "@/lib/chat/chatMessageCache";
import { chatBubbleShellClass, chatBubbleTextClass } from "@/lib/chat/chatBubbleStyles";
import { persistAnonChatMessage } from "@/lib/chat/persistAnonMessage";
import { persistMessageDelete } from "@/lib/chat/persistMessageDelete";
import {
  DELETED_MESSAGE_PREVIEW,
  deleteOpId,
  isCanonicalDeleteAuthor,
} from "@/lib/chat/messageDelete";
import { viewerHideKeys } from "@/lib/chat/messageDeleteServer";
import {
  dequeueMessageDelete,
  forgetLocalHiddenMessage,
  queueMessageDelete,
  readLocalHiddenMessageIds,
  readQueuedMessageDeletes,
  rememberLocalHiddenMessage,
} from "@/lib/chat/messageDeleteLocal";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { useFormatLastSeen } from "@/hooks/useLocaleFormatters";
import { useChatViewportLock } from "@/hooks/useChatViewportLock";
import { useIncomingMessageWhip } from "@/hooks/useIncomingMessageWhip";
import { useT } from "@/contexts/LocaleContext";
import { fastRouterReplace } from "@/lib/navigation/fastNavigate";
import {
  isInstantShuffleReturnDestination,
  isShuffleKeepAliveActive,
  pinShuffleWindowWhileAway,
  prepareInstantShuffleReturn,
} from "@/lib/navigation/shuffleKeepAlive";
import { resolveChatBackDestination } from "@/lib/navigation/nativeBack";
import {
  resetChatBackNavigationState,
  resolveChatBackAction,
} from "@/lib/navigation/chatBackNavigation";
import {
  CHAT_MESSAGE_PAGE_SIZE,
  captureScrollAnchor,
  mergeLiveWindowIntoHistory,
  prependOlderMessages,
  restoreScrollAnchor,
} from "@/lib/chat/chatHistoryPages";
import { replyQuoteText } from "@/lib/chat/replyQuote";
import { recordQaCriticalEvent } from "@/lib/qa/realDeviceQaDebug";
import {
  collection,
  doc,
  endBefore,
  getDocs,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";


type Message = {
  id: string;
  text: string;
  mine: boolean;
  fromUid?: string;
  senderAuthUid?: string;
  senderRole?: string;
  senderKind?: "anon" | "profile";
  reply?: string;
  storyReply?: {
    storyId: string;
    mediaUrl?: string;
    mediaType?: string;
    ownerUsername?: string;
  };
  type?: "text" | "audio" | "image" | "video";
  mediaUrl?: string;
  source?: "camera" | "gallery" | "audio";
  viewOnce?: boolean;
  autoModerationRequiresBlur?: boolean;
  moderationRequiresBlur?: boolean;
  readBy?: Record<string, boolean>;
  status?: "sending" | "error";
  clientId?: string;
  createdAt?: { toDate?: () => Date };
  hiddenFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
  verifiedProfileAttestation?: unknown;
};

function formatMessageTime(createdAt?: { toDate?: () => Date }) {
  if (!createdAt?.toDate) return "";
  return createdAt.toDate().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageRowKey(message: Message) {
  return message.clientId || message.id;
}

function chatMessagesSignature(messages: Message[]) {
  return messages
    .map(
      (message) =>
        `${messageRowKey(message)}:${message.mine ? 1 : 0}:${message.status || ""}:${message.text}:${message.mediaUrl || ""}:${message.deletedForEveryone ? 1 : 0}`,
    )
    .join("|");
}

function hydrateCachedMessages(
  chatId: string,
  rows: ReturnType<typeof readCachedChatMessages>,
  input: {
    chatAnonSessionId: string;
    currentUid: string;
    targetUid: string;
    chatOwnerUid: string;
    viewerUsername?: string;
    identityReady?: boolean;
    authReady?: boolean;
  },
): Message[] {
  if (!rows?.length) return [];

  const ctx = buildProfileAnonViewerContext({
    chatId,
    chatAnonSessionId: input.chatAnonSessionId,
    currentUid: input.currentUid,
    targetUid: input.targetUid,
    chatOwnerUid: input.chatOwnerUid,
    viewerUsername: input.viewerUsername,
    identityReady: input.identityReady,
    authReady: input.authReady,
  });
  const isOwnerViewing =
    ctx.isOwnerViewing ||
    inferOwnerViewingFromAuthors(ctx.currentUid, ctx.profileUid, rows);

  return rows.map((row) => {
    const base = cachedMessageToUi(row) as Message;
    const from = String(row.fromUid || "");
    const messageProfileUid = isProfileReplyAuthorId(from)
      ? from.slice("profile_".length)
      : undefined;

    // Hold cached side until role identity is ready (auth+profile is not enough).
    if (
      (ctx.identityReady !== true || (!ctx.currentUid && !isOwnerViewing)) &&
      typeof row.mine === "boolean"
    ) {
      return {
        ...base,
        mine: row.mine,
        senderKind: row.senderKind,
        fromUid: row.fromUid,
      };
    }

    const mine = resolveProfileAnonMessageMine({
      senderKind: row.senderKind,
      from,
      threadAnonId: ctx.threadAnonId,
      liveAnonId: ctx.liveAnonId,
      knownAnonIds: ctx.knownAnonIds,
      profileUid: ctx.profileUid,
      messageProfileUid,
      isOwnerViewing,
      ownerUid: ctx.currentUid,
      senderAuthUid: row.senderAuthUid,
      senderRole: row.senderRole,
      identityReady: ctx.identityReady,
    });

    return {
      ...base,
      mine,
      senderKind: row.senderKind,
      fromUid: row.fromUid,
    };
  });
}

function mergeLoadedChatMessages(loaded: Message[], pending: Message[]) {
  const merged = loaded.map((message) => ({ ...message }));
  const claimed = new Set<number>();

  for (const optimistic of pending) {
    // Prefer stable clientId. Never reconcile an optimistic bubble against a
    // peer message that happens to share the same text — that made profile
    // replies disappear while serverTimestamp was still pending.
    let matchIndex = -1;

    if (optimistic.clientId) {
      matchIndex = merged.findIndex(
        (message, index) =>
          !claimed.has(index) && message.clientId === optimistic.clientId,
      );
    }

    if (matchIndex < 0) {
      matchIndex = merged.findIndex((message, index) => {
        if (claimed.has(index)) return false;
        if (!optimistic.mine || !message.mine) return false;

        const sameAuthor =
          Boolean(optimistic.fromUid) &&
          Boolean(message.fromUid) &&
          optimistic.fromUid === message.fromUid;
        if (!sameAuthor) return false;

        const samePayload =
          message.text === optimistic.text &&
          (message.type || "text") === (optimistic.type || "text") &&
          (message.mediaUrl || "") === (optimistic.mediaUrl || "");
        if (samePayload) return true;

        const optimisticIsMedia = (optimistic.type || "text") !== "text";
        const loadedIsMedia = (message.type || "text") !== "text";
        return (
          optimisticIsMedia &&
          loadedIsMedia &&
          (optimistic.status === "sending" || optimistic.status === "error")
        );
      });
    }

    if (matchIndex >= 0) {
      claimed.add(matchIndex);
      merged[matchIndex] = {
        ...merged[matchIndex],
        ...(optimistic.clientId ? { clientId: optimistic.clientId } : {}),
        // Keep sender-side optimistic attestation until the listener carries it.
        ...(!merged[matchIndex].verifiedProfileAttestation &&
        optimistic.verifiedProfileAttestation
          ? { verifiedProfileAttestation: optimistic.verifiedProfileAttestation }
          : {}),
        status: undefined,
      };
      continue;
    }

    merged.push(optimistic);
  }

  return merged;
}

function threadHasPriorActivity(chatId: string) {
  if (readCachedChatMessages(chatId)?.length) return true;
  return getSessionChatIds().includes(chatId);
}

function readInitialTargetProfile(username: string) {
  const cachedLite = getCachedProfile(username);
  if (cachedLite) {
    return {
      uid: cachedLite.uid,
      photo: cachedLite.photo,
      blurPhoto: cachedLite.blurPhoto,
      lastActive: cachedLite.lastActive,
      online: cachedLite.online,
    };
  }

  const cachedFull = getCachedFullProfile(username) as Record<string, unknown> | null;
  if (!cachedFull) return null;

  return {
    uid: String(cachedFull.uid || ""),
    photo: resolveProfilePhoto(cachedFull),
    blurPhoto: cachedFull.adminBlurProfilePhoto === true,
    lastActive: String(cachedFull.lastActive || ""),
    online: cachedFull.online === true,
  };
}

export default function ProfileAnonChat({
  chatId,
  username,
}: {
  chatId: string;
  username: string;
}) {

  const t = useT();
  const { uxMode } = useUxMode();
  const router = useRouter();
  const pathname = usePathname();
  const shell = useMainTabShell();
  const chatViewportLockActive =
    isChatThreadRoute(pathname) && !shell.childrenHidden;
  const { profile: authProfile } = useAuth();
  const formatLastSeen = useFormatLastSeen();
  const initialProfile = readInitialTargetProfile(username);
  useNavUsefulPaint(Boolean(chatId) && Boolean(username));
  const initialThreadActive = threadHasPriorActivity(chatId);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!chatId) return [];
    const cached = readCachedChatMessages(chatId);
    if (!cached?.length) return [];
    return hydrateCachedMessages(chatId, cached, {
      chatAnonSessionId: "",
      currentUid: profileAuthUid(auth.currentUser),
      targetUid: String(initialProfile?.uid || ""),
      chatOwnerUid: "",
      viewerUsername:
        readCachedViewerIdentity(profileAuthUid(auth.currentUser))?.username || "",
      authReady: false,
      identityReady: isRoleIdentityReady({
        liveProfileUid: profileAuthUid(auth.currentUser),
        chatId,
        viewerUsername:
          readCachedViewerIdentity(profileAuthUid(auth.currentUser))?.username || "",
        profileUid: String(initialProfile?.uid || ""),
        threadAnonId: getProfileChatAnonSenderId(chatId, ""),
        authReady: false,
      }),
    });
  });
  const [chatSurfaceEngaged, setChatSurfaceEngaged] = useState(initialThreadActive);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [fullscreenUrl, setFullscreenUrl] = useState("");
  const [audioPreview, setAudioPreview] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingType, setPendingType] = useState<"audio" | "image" | "video" | null>(null);
  const [pendingSource, setPendingSource] = useState<"camera" | "gallery" | "audio" | undefined>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [firebaseUid, setFirebaseUid] = useState(() => String(auth.currentUser?.uid || ""));
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleteStage, setDeleteStage] = useState<"choose" | "confirm-me" | "confirm-everyone">("choose");
  const [authReady, setAuthReady] = useState(false);
  const [currentUid, setCurrentUid] = useState(() => profileAuthUid(auth.currentUser));
  const [targetUid, setTargetUid] = useState(initialProfile?.uid || "");
  const [targetPhoto, setTargetPhoto] = useState(initialProfile?.photo || "");
  const [targetBlurPhoto, setTargetBlurPhoto] = useState(initialProfile?.blurPhoto || false);
  const [targetLastActive, setTargetLastActive] = useState(initialProfile?.lastActive || "");
  const [targetOnline, setTargetOnline] = useState(initialProfile?.online || false);
  const [targetShowsLastSeen, setTargetShowsLastSeen] = useState(true);
  const [blockedByAbuse, setBlockedByAbuse] = useState(false);
  const [chatAnonSessionId, setChatAnonSessionId] = useState("");
  const [chatOwnerUid, setChatOwnerUid] = useState("");
  const [recording, setRecording] = useState(false);
  const [micNotice, setMicNotice] = useState<ChatMicNotice>(null);
  const audioPhaseRef = useRef<ChatAudioPhase>("idle");
  const [cameraMode, setCameraMode] = useState<"photo" | "video" | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraVideoElementRef = useRef<HTMLVideoElement>(null);
  const liveVideoRecorderRef = useRef<MediaRecorder | null>(null);
  const liveVideoChunksRef = useRef<Blob[]>([]);
  const messagePersistedRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioRecordingSessionRef = useRef(0);
  const audioPreviewUrlRef = useRef("");
  const imagePreviewUrlRef = useRef("");
  const videoPreviewUrlRef = useRef("");
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyOldestSnapRef = useRef<QueryDocumentSnapshot | null>(null);
  const stickToBottomRef = useRef(true);
  const keepComposerFocusRef = useRef(false);
  const keyboardAnimatingRef = useRef(false);
  const readMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReadMarkRef = useRef<{ chatId: string; viewerId: string } | null>(null);
  const lastReadRenderedKeyRef = useRef("");
  const inboundReadIdsRef = useRef<string[]>([]);
  const chatSeenVisibleRef = useRef(false);
  const lastRenderedQaKeyRef = useRef("");
  const lastAuthorshipProbeKeyRef = useRef("");
  const chatMetaRef = useRef<InboxChat | null>(null);
  const chatDocDataRef = useRef<Record<string, unknown>>({});
  const [chatMetaVersion, setChatMetaVersion] = useState(0);
  const threadContextRef = useRef({
    chatId: "",
    currentUid: "",
    targetUid: "",
    chatOwnerUid: "",
    chatAnonSessionId: "",
    viewerUsername: "",
    isOwnerViewing: false,
    profileUid: "",
    identityReady: false,
  });

  function scrollChatToBottom() {
    const node = messagesScrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
      return;
    }

    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }

  function scheduleScrollToBottom(options?: { keepKeyboard?: boolean }) {
    if (options?.keepKeyboard) {
      keepComposerFocusRef.current = true;
    }

    stickToBottomRef.current = true;
    const run = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollChatToBottom();
          if (keepComposerFocusRef.current) {
            refocusComposer();
          }
        });
      });
    };

    if (keyboardAnimatingRef.current) {
      window.setTimeout(run, 360);
      return;
    }

    run();
  }
  useSyncExternalStore(subscribeAnonSession, getAnonSessionVersion, () => "anon_server");
  const markReadContextRef = useRef({
    chatId: "",
    authReady: false,
    currentUid: "",
    targetUid: "",
    chatOwnerUid: "",
    chatAnonSessionId: "",
    username: "",
  });

  function refocusComposer() {
    const input = inputRef.current;
    if (!input) return;

    const focus = () => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    };

    focus();
    requestAnimationFrame(focus);
    window.setTimeout(focus, 0);
    window.setTimeout(focus, 80);
    window.setTimeout(focus, 180);
  }

  function flushSeenThreadReadOnLeave() {
    const inboundId = inboundReadIdsRef.current[inboundReadIdsRef.current.length - 1] || "";
    if (!inboundId) return;
    const ctx = markReadContextRef.current;
    const chat = chatMetaRef.current;
    const senderId = getProfileChatAnonSenderId(ctx.chatId, ctx.chatAnonSessionId);
    const profileOwnerUid = ctx.targetUid || ctx.chatOwnerUid;
    const ownerViewing = Boolean(
      ctx.currentUid && profileOwnerUid && ctx.currentUid === profileOwnerUid,
    );
    const leave = resolveLeaveThreadRead({
      seenVisible: chatSeenVisibleRef.current,
      viewerIdentity: ownerViewing ? ctx.currentUid : senderId,
      canonicalThreadId: chat?.canonicalChatId || ctx.chatId,
      activeDetailThreadId: chat?.canonicalChatId || ctx.chatId,
      renderedInboundMessageIds: inboundReadIdsRef.current,
      latestInboundMessageId: inboundId,
      alreadyMarkedKey: lastReadRenderedKeyRef.current,
    });
    if (leave.mark) markOpenChatAsRead(inboundId);
  }

  function goBackFromChat() {
    const backAction = resolveChatBackAction(pathname);
    if (backAction?.kind === "dismiss-keyboard") return;
    flushSeenThreadReadOnLeave();

    const dest = resolveChatBackDestination(pathname);
    if (isInstantShuffleReturnDestination(dest)) {
      prepareInstantShuffleReturn();
      router.replace(dest);
      return;
    }
    if (isShuffleKeepAliveActive() && dest.startsWith("/u/")) {
      pinShuffleWindowWhileAway();
      router.replace(dest);
      return;
    }
    fastRouterReplace(router, dest);
  }

  function markOpenChatAsRead(renderedMessageId: string) {
    const ctx = markReadContextRef.current;
    const chat = chatMetaRef.current;
    if (!ctx.chatId || !ctx.authReady || !chat || !renderedMessageId) return;
    const documentVisible =
      typeof document === "undefined" ? true : document.visibilityState === "visible";
    if (documentVisible) chatSeenVisibleRef.current = true;
    if (!documentVisible && !chatSeenVisibleRef.current) return;

    // Always read the live URL — render-closure pathname goes stale on list
    // navigation and incorrectly cleared unread when only /chats opened.
    const livePath =
      typeof window !== "undefined"
        ? window.location.pathname.split("?")[0].split("#")[0]
        : pathname;
    const activeMatch = livePath.match(/\/chat\/([^/?#]+)/);
    const activeChatId = activeMatch ? decodeURIComponent(activeMatch[1]) : "";
    const canonicalThreadId = chat.canonicalChatId || ctx.chatId;
    if (
      !isExactActiveDetailThread(activeChatId, ctx.chatId, [
        canonicalThreadId,
        chat.id,
      ])
    ) {
      return;
    }
    // List route must never clear unread (manual QA: list-open no-clear).
    if (livePath === "/chats" || livePath.startsWith("/chats/")) return;

    const senderId = getProfileChatAnonSenderId(ctx.chatId, ctx.chatAnonSessionId);
    const profileOwnerUid = ctx.targetUid || ctx.chatOwnerUid;
    const ownerViewing = Boolean(
      ctx.currentUid && profileOwnerUid && ctx.currentUid === profileOwnerUid,
    );
    const messageViewerId = ownerViewing ? ctx.currentUid : senderId;

    if (!messageViewerId) return;
    const readDecision = resolveDetailReadMark({
      viewerIdentity: messageViewerId,
      canonicalThreadId,
      activeDetailThreadId: canonicalThreadId,
      renderedInboundMessageIds: inboundReadIdsRef.current,
      latestInboundMessageId: renderedMessageId,
      documentVisible: documentVisible || chatSeenVisibleRef.current,
      alreadyMarkedKey: lastReadRenderedKeyRef.current,
    });
    if (!readDecision.mark) return;
    const readKey = `${canonicalThreadId}:${messageViewerId}:${renderedMessageId}`;
    if (lastReadRenderedKeyRef.current === readKey) return;
    lastReadRenderedKeyRef.current = readKey;

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          "sayittome_qa_clear_read_reason",
          "detail-rendered",
        );
        window.sessionStorage.setItem(
          "sayittome_qa_clear_read_thread",
          canonicalThreadId,
        );
      } catch {
        /* ignore */
      }
    }

    // Optimistic meta so leaving detail immediately reflects read before the
    // Firestore snapshot round-trip (and survives late sender unread dirty).
    chatMetaRef.current = {
      ...chat,
      canonicalChatId: canonicalThreadId,
      latestMessageId: renderedMessageId,
      latestReadMessageId: renderedMessageId,
      latestReadMessageIds: {
        ...(chat.latestReadMessageIds || {}),
        [messageViewerId]: renderedMessageId,
      },
      unreadCounts: {
        ...(chat.unreadCounts || {}),
        [messageViewerId]: 0,
      },
      readBy: {
        ...(chat.readBy || {}),
        [messageViewerId]: true,
      },
    };

    void markThreadReadExact(
      canonicalThreadId,
      renderedMessageId,
      "detail-rendered",
      messageViewerId,
      chatMetaRef.current,
      ctx.currentUid,
    ).catch(() => {
      if (lastReadRenderedKeyRef.current === readKey) {
        lastReadRenderedKeyRef.current = "";
      }
    });
  }

  useEffect(() => {
    document.body.classList.toggle("sayittome-chat-fullscreen-open", Boolean(fullscreenUrl));
    return () => {
      document.body.classList.remove("sayittome-chat-fullscreen-open");
    };
  }, [fullscreenUrl]);

  useEffect(() => {
    if (!currentUid || currentUid.startsWith("anon_")) return;
    armVerifiedProfileLinkClaimRetry(currentUid);
  }, [currentUid]);

  useEffect(() => {
    return () => {
      audioRecordingSessionRef.current += 1;
      revokePreviewUrls();
      resetAudioRecorder();
    };
  }, []);

  useEffect(() => {
    const onBack = () => setFullscreenUrl("");
    window.addEventListener("sayittome:close-chat-fullscreen", onBack);
    return () => window.removeEventListener("sayittome:close-chat-fullscreen", onBack);
  }, []);

  useChatViewportLock(chatViewportLockActive);

  useEffect(() => {
    let cancelled = false;

    void auth.authStateReady().then(() => {
      if (cancelled) return;
      setCurrentUid(profileAuthUid(auth.currentUser));
      setFirebaseUid(String(auth.currentUser?.uid || ""));
      setAuthReady(true);
    });

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(profileAuthUid(user));
      setFirebaseUid(String(user?.uid || ""));
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    const uid = profileAuthUid(auth.currentUser) || currentUid;
    const username = String(authProfile?.username || "").trim();
    if (uid && username) writeCachedViewerIdentity(uid, username);
  }, [authProfile?.username, currentUid]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      keyboardAnimatingRef.current = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        keyboardAnimatingRef.current = false;
        if (keepComposerFocusRef.current) {
          refocusComposer();
        }
        if (!stickToBottomRef.current) return;
        scheduleScrollToBottom({ keepKeyboard: keepComposerFocusRef.current });
      }, 360);
    };

    viewport.addEventListener("resize", onResize);
    return () => {
      viewport.removeEventListener("resize", onResize);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!chatId) return;
    prefetchChatThread(chatId);

    let cancelled = false;
    void (async () => {
      await auth.authStateReady();
      if (cancelled) return;

      const uid = profileAuthUid(auth.currentUser);
      setCurrentUid(uid);
      setAuthReady(true);

      const cached = readCachedChatMessages(chatId);
      if (!cached?.length) return;

      setMessages((prev) => {
        const canonical = resolveCanonicalViewerIdentity({
          authReady: true,
          authUid: uid,
          chatId,
          profileUid: targetUid || chatOwnerUid,
          liveUsername: "",
        });
        const roleReady = isRoleIdentityReady({
          liveProfileUid: canonical.viewerUid,
          chatId,
          viewerUsername: canonical.viewerUsername,
          profileUid: targetUid || chatOwnerUid,
          explicitOwner: isProfileThreadOwner({
            chatId,
            authUid: canonical.viewerUid,
            profileUid: targetUid || chatOwnerUid,
            viewerUsername: canonical.viewerUsername,
          }),
          threadAnonId: getProfileChatAnonSenderId(chatId, chatAnonSessionId),
          authReady: true,
        });
        const hydrated = hydrateCachedMessages(chatId, cached, {
          chatAnonSessionId,
          currentUid: canonical.viewerUid,
          targetUid,
          chatOwnerUid,
          viewerUsername: canonical.viewerUsername,
          authReady: true,
          identityReady: roleReady,
        });
        if (prev.length === 0) return hydrated;
        const ctx = buildProfileAnonViewerContext({
          chatId,
          chatAnonSessionId,
          currentUid: canonical.viewerUid,
          targetUid,
          chatOwnerUid,
          viewerUsername: canonical.viewerUsername,
          authReady: true,
          identityReady: roleReady,
        });
        return remapProfileAnonMessagesMine(hydrated.length ? hydrated : prev, ctx);
      });
      setChatSurfaceEngaged((engaged) => engaged || cached.length > 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, chatAnonSessionId, targetUid, chatOwnerUid]);

  useEffect(() => {
    if (!chatId) return;
    registerSessionChat(chatId);
  }, [chatId]);

  useEffect(() => {
    messagePersistedRef.current = false;

    return () => {
      if (messagePersistedRef.current) return;
      const leavingId = chatId;

      void (async () => {
        try {
          const hasActivity = await chatHasActivity(leavingId);
          if (hasActivity) return;
          await deleteEmptyChatIfIdle(leavingId);
          unregisterSessionChat(leavingId);
        } catch {
          // Keep the authorized thread in session history if the idle check fails.
        }
      })();
    };
  }, [chatId]);

  useEffect(() => {
    if (!authReady) return;

    const profileOwnerUid = targetUid || chatOwnerUid;
    if (!profileOwnerUid) return;

    const senderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    const ownerViewing = Boolean(
      currentUid && profileOwnerUid && currentUid === profileOwnerUid,
    );
    if (ownerViewing) return;

    const visitorId = getVisitorId();

    findActiveAbuseBlock({
      receptorUid: profileOwnerUid,
      blockedAnonId: senderId,
      blockedVisitorId: visitorId,
    })
      .then((block) => setBlockedByAbuse(Boolean(block)))
      .catch(() => setBlockedByAbuse(false));
  }, [targetUid, chatOwnerUid, authReady, chatId, chatAnonSessionId, currentUid]);

  useEffect(() => {
    if (!chatId) return;

    const unsub = onSnapshot(doc(db, "chats", chatId), (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() as Record<string, unknown> | undefined;
      chatDocDataRef.current = data || {};
      setChatAnonSessionId(String(data?.anonSessionId || ""));
      setChatOwnerUid(
        String(data?.receptorUid || data?.targetUid || data?.anonOwnerUid || ""),
      );
      const chatPhoto = String(data?.targetPhoto || "").trim();
      if (chatPhoto) {
        setTargetPhoto((prev) => prev || chatPhoto);
      }
      chatMetaRef.current = inboxChatFromFirestore(chatId, data, username);
      setChatMetaVersion((version) => version + 1);
    });

    return () => {
      if (readMarkTimerRef.current) {
        clearTimeout(readMarkTimerRef.current);
        readMarkTimerRef.current = null;
      }
      // Do NOT mark-read on unmount/cleanup — stale pathname made list-open
      // look like it cleared unread. Detail snapshots already mark while open.
      unsub();
    };
  }, [chatId, username]);

  useEffect(() => {
    let cancelled = false;

    async function loadTargetProfile() {
      const cachedLite = getCachedProfile(username);
      const cachedFull = getCachedFullProfile(username) as Record<string, unknown> | null;
      const hasCachedProfile = Boolean(cachedLite || cachedFull);

      if (cachedLite) {
        setTargetUid(cachedLite.uid);
        setTargetPhoto(cachedLite.photo);
        setTargetBlurPhoto(cachedLite.blurPhoto);
        setTargetLastActive(cachedLite.lastActive);
        setTargetOnline(cachedLite.online);
      } else if (cachedFull) {
        const photo = resolveProfilePhoto(cachedFull);
        const uid = String(cachedFull.uid || "");
        setTargetUid(uid);
        setTargetPhoto(photo);
        setTargetBlurPhoto(cachedFull.adminBlurProfilePhoto === true);
        setTargetLastActive(String(cachedFull.lastActive || ""));
        setTargetOnline(cachedFull.online === true);
      }

      async function refreshFromNetwork() {
        try {
          const res = await fetch(`/api/profile/${encodeURIComponent(username)}?ts=${Date.now()}`, {
            cache: "no-store",
          });
          const json = await res.json();
          if (cancelled) return;

          const profile = json?.profile;
          const photo = resolveProfilePhoto(profile);
          const uid = String(profile?.uid || "");

          setTargetUid(uid);
          setTargetPhoto(photo);
          setTargetBlurPhoto(profile?.adminBlurProfilePhoto === true);
          setTargetLastActive(String(profile?.lastActive || ""));
          setTargetOnline(profile?.online === true);
          setTargetShowsLastSeen(profile?.mostrarUltimaVez !== false);

          setCachedProfile(username, {
            uid,
            photo,
            blurPhoto: profilePhotoRequiresBlur({
              adminBlurProfilePhoto: profile?.adminBlurProfilePhoto === true,
              adminBlurFotosPerfil: profile?.adminBlurFotosPerfil === true,
            }),
            lastActive: String(profile?.lastActive || ""),
            online: profile?.online === true,
          });

          if (photo && chatId) {
            void updateDoc(doc(db, "chats", chatId), {
              targetPhoto: photo,
              ...(uid ? { targetUid: uid, receptorUid: uid } : {}),
            }).catch(() => undefined);
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (hasCachedProfile) {
        void refreshFromNetwork();
        return;
      }

      await refreshFromNetwork();
    }

    void loadTargetProfile();

    return () => {
      cancelled = true;
    };
  }, [username, chatId]);

  const isClassic = uxMode === "classic";
  const docOwnerUid = String(
    chatDocDataRef.current?.receptorUid ||
      chatDocDataRef.current?.targetUid ||
      chatDocDataRef.current?.anonOwnerUid ||
      "",
  ).trim();
  const profileOwnerUid = targetUid || chatOwnerUid || docOwnerUid;
  const canonicalViewer = resolveCanonicalViewerIdentity({
    authReady,
    authUid: currentUid,
    chatId,
    profileUid: profileOwnerUid,
    liveUsername: String(authProfile?.username || "").trim(),
  });
  const viewerUid = canonicalViewer.viewerUid;
  const viewerUsername = canonicalViewer.viewerUsername;
  const provenOwner = isProfileThreadOwner({
    chatId,
    authUid: viewerUid,
    profileUid: profileOwnerUid,
    viewerUsername,
  });
  const isOwnerViewing =
    provenOwner || inferOwnerViewingFromAuthors(viewerUid, profileOwnerUid, messages);
  const identityReady = isRoleIdentityReady({
    liveProfileUid: currentUid,
    chatId,
    viewerUsername,
    profileUid: profileOwnerUid,
    explicitOwner: provenOwner,
    threadAnonId: getProfileChatAnonSenderId(chatId, chatAnonSessionId),
    authReady,
  });
  const liveVisitorAnonId = getAnonSessionId();
  const outgoingSender = buildCanonicalSender({
    authReady,
    liveProfileUid: currentUid,
    threadAnonId: getProfileChatAnonSenderId(chatId, chatAnonSessionId),
    liveAnonId: provenOwner ? "" : liveVisitorAnonId,
    chatId,
    viewerUsername,
    profileUid: profileOwnerUid,
    explicitOwner: provenOwner,
  });
  const canSend = outgoingSender.ok;
  const profileUid = profileOwnerUid || targetUid;
  threadContextRef.current = {
    chatId,
    currentUid: viewerUid,
    targetUid,
    chatOwnerUid,
    chatAnonSessionId,
    viewerUsername,
    isOwnerViewing,
    profileUid,
    identityReady,
  };

  // Source of truth for bubble side: recompute mine every render from durable fromUid.
  const displayMessages = applyAuthorshipCorrections(
    remapProfileAnonMessagesMine(
      messages,
      buildProfileAnonViewerContext({
        chatId,
        chatAnonSessionId,
        currentUid: viewerUid,
        targetUid,
        chatOwnerUid: chatOwnerUid || docOwnerUid,
        viewerUsername,
        identityReady,
        authReady,
        liveAnonId: provenOwner ? "" : liveVisitorAnonId,
      }),
    ),
  );

  const anonSenderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);

  if (displayMessages.length > 0) {
    const probeKey = `${isOwnerViewing ? 1 : 0}:${displayMessages
      .map((row) => `${row.id}:${row.mine ? 1 : 0}`)
      .join(",")}`;
    if (probeKey !== lastAuthorshipProbeKeyRef.current) {
      lastAuthorshipProbeKeyRef.current = probeKey;
      recordAuthorshipProbe({
        phase: "render",
        renderer: "ProfileAnonChat",
        chatId,
        authUid: currentUid,
        authAnonymous: Boolean(auth.currentUser?.isAnonymous),
        viewerSlug: viewerUsername,
        profileUid: profileOwnerUid,
        isOwnerViewing,
        identityReady,
        authReady,
        messages: displayMessages,
      });
      recordAuthorshipIncident({
        hrefPath: typeof window === "undefined" ? "" : window.location.pathname.split("?")[0],
        renderer: "ProfileAnonChat",
        chatKind: "profileAnon",
        chatIdRedacted: redactChatId(chatId),
        collection: "chats/{id}/mensajes",
        authReady,
        authAnonymous: Boolean(auth.currentUser?.isAnonymous),
        authUidPresent: Boolean(currentUid),
        viewerSlugPresent: Boolean(viewerUsername),
        profileUidPresent: Boolean(profileOwnerUid),
        identityReady,
        isOwnerViewing,
        participantsShapes: [
          currentUid ? "profile_uid" : "",
          anonSenderId.startsWith("anon_") ? "thread_anon" : "",
        ].filter(Boolean),
        rows: displayMessages.slice(-40).map((message) =>
          buildAuthorshipIncidentRow({
            chatId,
            messageId: message.id,
            fromUid: message.fromUid,
            senderAuthUid: message.senderAuthUid,
            senderRole: message.senderRole,
            senderKind: message.senderKind,
            isMine: message.mine,
            threadAnonId: anonSenderId,
            viewerUid,
            source: message.status === "sending" ? "optimistic" : "server",
            mineReason: explainMineDecision({
              from: String(message.fromUid || ""),
              senderAuthUid: message.senderAuthUid,
              senderRole: message.senderRole,
              senderKind: message.senderKind,
              ownerUid: viewerUid,
              isOwnerViewing,
              identityReady,
              threadAnonId: anonSenderId,
            }),
          }),
        ),
      });
    }
  }
  const presenceLabel =
    targetShowsLastSeen && !isOwnerViewing
      ? formatLastSeen(targetLastActive, targetOnline)
      : "";
  const viewerId = isOwnerViewing ? currentUid : anonSenderId;
  const hasChatActivity = messages.length > 0;
  const surfaceEngaged = chatSurfaceEngaged || hasChatActivity;
  const classicChatEngaged =
    isClassic &&
    (isOwnerViewing
      ? hasChatActivity
      : displayMessages.some((message) => message.mine) || hasChatActivity);
  const threadIntro = resolveAnonChatThreadIntro({
    isClassic,
    isOwnerViewing,
    surfaceEngaged,
    authReady,
  });
  const showClassicIntro = threadIntro.showClassicIntro;
  const showModernVisitorIntro = threadIntro.showModernIntro;
  const anonIdentity = resolveProfileChatAnonIdentity(chatId, chatAnonSessionId, {
    isOwnerViewing,
  });
  const showAnonIdentityNotice = shouldShowAnonIdentityGuide({
    isOwnerViewing,
    identityChanged: anonIdentity.identityChanged,
    hasChatActivity,
    showModernVisitorIntro,
  });
  const anonIdentityChangeInsertIndex = showAnonIdentityNotice
    ? resolveAnonIdentityDividerIndex(
        chatId,
        displayMessages,
        anonIdentity.threadAnonId,
        anonIdentity.liveAnonId,
      )
    : -1;
  const showClassicIdentityBar =
    isClassic &&
    !isOwnerViewing &&
    !showClassicIntro &&
    !(showAnonIdentityNotice && hasChatActivity);
  const whipViewerId = isOwnerViewing ? currentUid : anonSenderId;
  useIncomingMessageWhip(
    messages,
    whipViewerId,
    Boolean(whipViewerId),
    chatId,
    currentUid,
    chatMetaRef.current ?? undefined,
  );
  const chatWidthClass = isClassic ? "w-full" : "mx-auto max-w-5xl";
  // Re-read when chat meta snapshot updates so verify uses canonical id.
  const verifiedLinkChatId =
    (chatMetaVersion >= 0 && chatMetaRef.current?.canonicalChatId) || chatId;
  const displayPeerName = isOwnerViewing
    ? formatAnonSessionLabel(anonSenderId)
    : username;
  const avatarProps = {
    ownerUid: isOwnerViewing ? "" : profileUid,
    username: displayPeerName,
    photo: isOwnerViewing ? "" : targetPhoto,
    anonAvatar: isOwnerViewing,
    anonKey: anonSenderId || chatAnonSessionId || chatId,
    mode: (isOwnerViewing ? "delegate" : "navigate") as "delegate" | "navigate",
    preferProfile: !isOwnerViewing,
    blurPhoto: isOwnerViewing ? false : targetBlurPhoto,
  };

  markReadContextRef.current = {
    chatId,
    authReady,
    currentUid,
    targetUid,
    chatOwnerUid,
    chatAnonSessionId,
    username,
  };


  const inboundRenderedIds = displayMessages
    .filter((row) => !row.mine && row.id)
    .map((row) => String(row.id));
  inboundReadIdsRef.current = inboundRenderedIds;
  const latestInboundMessageId = inboundRenderedIds[inboundRenderedIds.length - 1] || "";
  const latestRenderedMessageId = messages[messages.length - 1]?.id || "";
  useEffect(() => {
    function flushRead() {
      if (document.visibilityState === "visible") chatSeenVisibleRef.current = true;
      markOpenChatAsRead(latestInboundMessageId);
    }
    flushRead();
    document.addEventListener("visibilitychange", flushRead);
    function onPageHide() {
      if (chatSeenVisibleRef.current) markOpenChatAsRead(latestInboundMessageId);
    }
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", flushRead);
      window.removeEventListener("pagehide", onPageHide);
      if (chatSeenVisibleRef.current) markOpenChatAsRead(latestInboundMessageId);
    };
  }, [
    chatId,
    authReady,
    currentUid,
    targetUid,
    chatOwnerUid,
    chatAnonSessionId,
    latestInboundMessageId,
    chatMetaVersion,
  ]);
  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest) return;
    const qaKey = `${chatId}:${messageRowKey(latest)}:${latest.status || "ack"}`;
    if (lastRenderedQaKeyRef.current === qaKey) return;
    lastRenderedQaKeyRef.current = qaKey;
    recordQaCriticalEvent("chat", "CHAT_MESSAGE_RENDERED", {
      threadId: chatId,
      messageId: latest.id,
      clientId: latest.clientId || "",
      senderKind: latest.senderKind || "",
      mine: latest.mine,
      status: latest.status || "ack",
      messageRenderedAt: Date.now(),
    });
  }, [chatId, messages]);

  useEffect(() => {
    if (!showAnonIdentityNotice || !chatId || typeof window === "undefined") return;
    const key = `sayittome:anon-divider:${chatId}`;
    if (window.sessionStorage.getItem(key) !== null) return;
    const index = findAnonIdentityChangeInsertIndex(
      messages,
      anonIdentity.threadAnonId,
      anonIdentity.liveAnonId,
    );
    if (index >= 0 && index <= messages.length) {
      window.sessionStorage.setItem(key, String(index));
    }
  }, [
    anonIdentity.liveAnonId,
    anonIdentity.threadAnonId,
    chatId,
    messages,
    showAnonIdentityNotice,
  ]);

  useEffect(() => {
    if (!chatId || !authReady) return;

    historyOldestSnapRef.current = null;
    setHasMoreOlder(true);

    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limitToLast(CHAT_MESSAGE_PAGE_SIZE),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const baseCtx = buildProfileAnonViewerContext({
          chatId: threadContextRef.current.chatId,
          chatAnonSessionId: threadContextRef.current.chatAnonSessionId,
          currentUid: threadContextRef.current.currentUid,
          targetUid: threadContextRef.current.targetUid,
          chatOwnerUid: threadContextRef.current.chatOwnerUid,
          viewerUsername: threadContextRef.current.viewerUsername,
          authReady: true,
          identityReady: threadContextRef.current.identityReady,
        });
        const hideIdentities = viewerHideKeys({
          authUid: firebaseUid || auth.currentUser?.uid || "",
          profileUid: baseCtx.currentUid,
          anonId: baseCtx.threadAnonId,
        });
        const localHidden = new Set(readLocalHiddenMessageIds(chatId));
        const loaded = mapFirestoreDocsToProfileAnonMessages(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            data: docSnap.data() as ProfileAnonFirestoreMessage,
          })),
          { ...baseCtx, hideIdentities },
        ).filter((row) => !localHidden.has(row.id));
        const ctx = {
          ...baseCtx,
          isOwnerViewing:
            baseCtx.isOwnerViewing ||
            inferOwnerViewingFromAuthors(
              baseCtx.currentUid,
              baseCtx.profileUid,
              loaded,
            ),
        };
        const messageViewerId = ctx.isOwnerViewing ? ctx.currentUid : ctx.threadAnonId;
        recordAuthorshipProbe({
          phase: snapshot.metadata.fromCache ? "snapshot-cache" : "snapshot-server",
          renderer: "ProfileAnonChat",
          chatId,
          authUid: ctx.currentUid,
          authAnonymous: Boolean(auth.currentUser?.isAnonymous),
          viewerSlug: ctx.viewerUsername || "",
          profileUid: ctx.profileUid,
          isOwnerViewing: ctx.isOwnerViewing,
          fromCache: snapshot.metadata.fromCache,
          messages: loaded,
        });
        const latestSnapshotDoc = snapshot.docs[snapshot.docs.length - 1];
        recordQaCriticalEvent("chat", "CHAT_MESSAGE_LISTENER_SNAPSHOT", {
          threadId: chatId,
          listenerSnapshotAt: Date.now(),
          documentCount: snapshot.size,
          changeCount: snapshot.docChanges().length,
          latestMessageId: latestSnapshotDoc?.id || "",
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        });

        if (snapshot.docs[0] && !historyOldestSnapRef.current) {
          historyOldestSnapRef.current = snapshot.docs[0];
        }
        if (snapshot.size < CHAT_MESSAGE_PAGE_SIZE) {
          setHasMoreOlder(false);
        }

        setMessages((prev) => {
          const pending = prev.filter(
            (message) => message.status === "sending" || message.status === "error",
          );
          const merged = mergeLiveWindowIntoHistory(
            prev,
            loaded,
            pending,
            mergeLoadedChatMessages,
          );
          writeCachedChatMessages(
            chatId,
            merged
              .filter((row) => row.status !== "sending" && row.status !== "error")
              .map(uiMessageToCached),
          );
          if (chatMessagesSignature(prev) === chatMessagesSignature(merged)) {
            return prev;
          }
          return merged;
        });

        if (!messageViewerId) return;

        pendingReadMarkRef.current = { chatId, viewerId: messageViewerId };
        if (readMarkTimerRef.current) clearTimeout(readMarkTimerRef.current);

        readMarkTimerRef.current = setTimeout(() => {
          const pending = pendingReadMarkRef.current;
          if (!pending || pending.chatId !== chatId || pending.viewerId !== messageViewerId) {
            return;
          }

          const activeMatch = pathname.match(/\/chat\/([^/?#]+)/);
          const activeChatId = activeMatch ? decodeURIComponent(activeMatch[1]) : "";
          if (activeChatId !== chatId) return;
          if (typeof document !== "undefined" && document.hidden) return;

          const batch = writeBatch(db);
          let pendingMarks = 0;

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data() as { fromUid?: string; readBy?: Record<string, boolean> };
            if (String(data.fromUid || "") === messageViewerId) return;
            if (data.readBy?.[messageViewerId]) return;

            batch.update(doc(db, "chats", chatId, "mensajes", docSnap.id), {
              [`readBy.${messageViewerId}`]: true,
            });
            pendingMarks += 1;
          });

          if (pendingMarks > 0) {
            void batch.commit().catch(() => undefined);
          }
        }, 900);

      },
      (error) => {
        console.error(error);
      },
    );

    return () => {
      if (readMarkTimerRef.current) {
        clearTimeout(readMarkTimerRef.current);
        readMarkTimerRef.current = null;
      }
      unsub();
    };
  }, [chatId, authReady, chatAnonSessionId, currentUid, targetUid, chatOwnerUid, pathname, firebaseUid]);

  useEffect(() => {
    if (!chatId || !authReady) return;

    const ctx = buildProfileAnonViewerContext({
      chatId,
      chatAnonSessionId,
      currentUid: viewerUid,
      targetUid,
      chatOwnerUid,
      viewerUsername,
      identityReady,
      authReady: true,
    });

    queueMicrotask(() => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = remapProfileAnonMessagesMine(prev, ctx);
        return next === prev ? prev : next;
      });
    });
  }, [
    chatId,
    authReady,
    chatAnonSessionId,
    currentUid,
    targetUid,
    chatOwnerUid,
    viewerUid,
    viewerUsername,
    identityReady,
  ]);

  useEffect(() => {
    if (
      !shouldAutoscrollChatThread({
        stickToBottom: stickToBottomRef.current,
        showIntro: showClassicIntro || showModernVisitorIntro,
      })
    ) {
      return;
    }
    scheduleScrollToBottom();
  }, [messages.length, showClassicIntro, showModernVisitorIntro]);

  useEffect(
    () =>
      subscribeChatMicrophonePermissionRefresh((result) => {
        setMicNotice((previous) => noticeAfterMicrophoneResume({ previous, os: result }));
      }),
    [],
  );

  async function loadOlderMessages() {
    if (!chatId || !authReady || loadingOlder || !hasMoreOlder) return;
    const oldest = historyOldestSnapRef.current;
    if (!oldest) {
      setHasMoreOlder(false);
      return;
    }

    setLoadingOlder(true);
    const anchor = captureScrollAnchor(messagesScrollRef.current);
    stickToBottomRef.current = false;

    try {
      const olderQuery = query(
        collection(db, "chats", chatId, "mensajes"),
        orderBy("createdAt", "asc"),
        endBefore(oldest),
        limitToLast(CHAT_MESSAGE_PAGE_SIZE),
      );
      const snapshot = await getDocs(olderQuery);
      if (snapshot.empty) {
        setHasMoreOlder(false);
        return;
      }

      const baseCtx = buildProfileAnonViewerContext({
        chatId: threadContextRef.current.chatId,
        chatAnonSessionId: threadContextRef.current.chatAnonSessionId,
        currentUid: threadContextRef.current.currentUid,
        targetUid: threadContextRef.current.targetUid,
        chatOwnerUid: threadContextRef.current.chatOwnerUid,
        viewerUsername: threadContextRef.current.viewerUsername,
        authReady: true,
        identityReady: threadContextRef.current.identityReady,
      });
      const hideIdentities = viewerHideKeys({
        authUid: firebaseUid || auth.currentUser?.uid || "",
        profileUid: baseCtx.currentUid,
        anonId: baseCtx.threadAnonId,
      });
      const localHidden = new Set(readLocalHiddenMessageIds(chatId));
      const older = mapFirestoreDocsToProfileAnonMessages(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          data: docSnap.data() as ProfileAnonFirestoreMessage,
        })),
        { ...baseCtx, hideIdentities },
      ).filter((row) => !localHidden.has(row.id));

      historyOldestSnapRef.current = snapshot.docs[0] || historyOldestSnapRef.current;
      if (snapshot.size < CHAT_MESSAGE_PAGE_SIZE) {
        setHasMoreOlder(false);
      }

      setMessages((prev) => prependOlderMessages(prev, older));
      requestAnimationFrame(() => {
        restoreScrollAnchor(messagesScrollRef.current, anchor);
      });
    } catch (error) {
      console.error(error);
      alert(t("chat_load_fail"));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function openRealCamera(mode: "photo" | "video") {
    if (isNativeChatShell()) {
      const opened = openChatFileInput(
        mode === "photo" ? cameraPhotoRef.current : cameraVideoRef.current,
      );
      if (!opened) alert(t("chat_camera_fail"));
      return;
    }

    const allowed = await ensureChatCameraStreamPermission(mode === "video");
    if (!allowed) {
      alert(t("chat_media_permission_denied"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: mode === "video",
      });

      setCameraMode(mode);
      setCameraStream(stream);

      setTimeout(() => {
        if (cameraVideoElementRef.current) {
          cameraVideoElementRef.current.srcObject = stream;
          cameraVideoElementRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (error) {
      const failure = classifyChatMediaFailure(error);
      if (failure === "cancelled") return;
      alert(
        failure === "denied" ? t("chat_media_permission_denied") : t("chat_camera_fail"),
      );
    }
  }

  function closeRealCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraMode(null);
  }

  async function captureRealPhoto() {
    const video = cameraVideoElementRef.current;

    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);

      setPendingBlob(blob);
      setPendingType("image");
      setPendingSource("camera");
      setImagePreview(url);
      setVideoPreview("");

      closeRealCamera();
    }, "image/jpeg", 0.92);
  }

  function startRealVideoRecording() {
    if (!cameraStream) return;

    liveVideoChunksRef.current = [];

    const recorder = new MediaRecorder(cameraStream);
    liveVideoRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        liveVideoChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(liveVideoChunksRef.current, {
        type: "video/webm",
      });

      const url = URL.createObjectURL(blob);

      setPendingBlob(blob);
      setPendingType("video");
      setPendingSource("camera");
      setVideoPreview(url);
      setImagePreview("");

      closeRealCamera();
    };

    recorder.start();
    setRecording(true);
  }

  function stopRealVideoRecording() {
    const recorder = liveVideoRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    setRecording(false);
  }

  function revokePreviewUrls() {
    if (audioPreviewUrlRef.current) {
      URL.revokeObjectURL(audioPreviewUrlRef.current);
      audioPreviewUrlRef.current = "";
    }

    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = "";
    }

    if (videoPreviewUrlRef.current) {
      URL.revokeObjectURL(videoPreviewUrlRef.current);
      videoPreviewUrlRef.current = "";
    }
  }

  function stopAudioStream() {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }

  function resetAudioRecorder() {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignore stop races while cleaning up.
      }
    }

    stopAudioStream();
  }

  function clearPreview() {
    audioRecordingSessionRef.current += 1;
    revokePreviewUrls();
    resetAudioRecorder();
    setAudioPreview("");
    setImagePreview("");
    setVideoPreview("");
    setPendingBlob(null);
    setPendingType(null);
    setPendingSource(undefined);
    setUploadProgress(null);
    setViewOnce(false);
    setRecording(false);
    audioPhaseRef.current = "idle";
  }

  function handleFile(file: File | null, source: "camera" | "gallery") {
    if (!file) return;
    const picked = fileFromChatInput(file, source);
    if (!picked) {
      alert(source === "camera" ? t("chat_camera_fail") : t("chat_gallery_fail"));
      return;
    }

    const url = URL.createObjectURL(picked.file);
    revokePreviewUrls();
    if (picked.type === "video") {
      videoPreviewUrlRef.current = url;
    } else {
      imagePreviewUrlRef.current = url;
    }

    setPendingBlob(picked.file);
    setPendingType(picked.type);
    setPendingSource(source);
    setViewOnce(source === "camera" ? viewOnce : false);
    setImagePreview(picked.type === "video" ? "" : url);
    setVideoPreview(picked.type === "video" ? url : "");
  }

  function openGalleryPicker() {
    const opened = openChatFileInput(galleryRef.current);
    if (!opened) {
      alert(t("chat_gallery_fail"));
    }
  }

  async function startAudioRecording() {
    const decision = reduceChatAudioEvent(audioPhaseRef.current, { type: "tap" });
    audioPhaseRef.current = decision.phase;
    if (decision.stopCapture) {
      stopAudioRecording();
      return;
    }
    if (!decision.startCapture) return;

    const session = audioRecordingSessionRef.current + 1;
    audioRecordingSessionRef.current = session;
    setRecording(true);
    setMicNotice(null);

    let permissionState: ChatMicrophonePermissionState | "unavailable" | "missing" =
      "prompt";
    try {
      const permission = await ensureChatMicrophonePermission();
      permissionState = permission.state;
      const plan = planChatMicrophoneStart({
        native: isNativeChatShell(),
        bridgeState:
          permission.state === "unavailable" ? "unavailable" : permission.state,
      });
      if (session !== audioRecordingSessionRef.current) {
        setRecording(false);
        audioPhaseRef.current = "idle";
        return;
      }
      if (!permission.allowed) {
        setRecording(false);
        audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
          type: permission.denied ? "permission-denied" : "error",
        }).phase;
        setMicNotice(plan.notice || noticeFromMicrophonePermission(permission));
        return;
      }

      const stream = await captureTrustedChatAudioStream({
        native: isNativeChatShell(),
        permissionState,
      });
      if (session !== audioRecordingSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        audioPhaseRef.current = "idle";
        return;
      }

      const ready = reduceChatAudioEvent(audioPhaseRef.current, { type: "stream-ready" });
      audioPhaseRef.current = ready.phase;

      revokePreviewUrls();
      setAudioPreview("");
      setImagePreview("");
      setVideoPreview("");
      setPendingBlob(null);
      setPendingType(null);
      setPendingSource(undefined);
      setUploadProgress(null);
      setViewOnce(false);

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = pickSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        void (async () => {
        if (session !== audioRecordingSessionRef.current) {
          resetAudioRecorder();
          setRecording(false);
          audioPhaseRef.current = "idle";
          return;
        }

        const rawBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });

        resetAudioRecorder();
        setRecording(false);

        if (rawBlob.size < CHAT_AUDIO_MIN_BYTES) {
          audioPhaseRef.current = reduceChatAudioEvent(
            audioPhaseRef.current,
            { type: "blob-too-small" },
          ).phase;
          setMicNotice("failed");
          return;
        }

        let playable = rawBlob;
        try {
          const prepared = await preparePlayableChatAudio(rawBlob);
          playable = prepared.blob;
          if (prepared.decodeFailed) {
            alert(t("chat_audio_preview_fail"));
          }
        } catch {
          alert(t("chat_audio_preview_fail"));
        }

        if (session !== audioRecordingSessionRef.current) return;

        revokePreviewUrls();
        const url = URL.createObjectURL(playable);
        audioPreviewUrlRef.current = url;
        setPendingBlob(playable);
        setPendingType("audio");
        setPendingSource("audio");
        setAudioPreview(url);
        audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
          type: "blob-ready",
        }).phase;
        })();
      };

      recorder.onerror = () => {
        if (session !== audioRecordingSessionRef.current) return;
        resetAudioRecorder();
        setRecording(false);
        audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
          type: "error",
        }).phase;
        setMicNotice("failed");
      };

      recorder.start(250);
    } catch (error) {
      if (session !== audioRecordingSessionRef.current) return;
      resetAudioRecorder();
      setRecording(false);
      const classified = classifyChatAudioCaptureFailure(error, {
        nativeDenied: false,
        nativePlatform: isNativeChatShell(),
        granted: permissionState === "granted",
        permissionState,
      });
      audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
        type: classified === "denied" ? "permission-denied" : "error",
      }).phase;
      setMicNotice(
        noticeFromCaptureFailure({
          classified,
          permissionState,
        }),
      );
    }
  }

  function cancelAudioRecording() {
    audioRecordingSessionRef.current += 1;
    resetAudioRecorder();
    setRecording(false);
    audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
      type: "cancel",
    }).phase;
  }

  function stopAudioRecording() {
    const ignored = reduceChatAudioEvent(audioPhaseRef.current, { type: "pointer-up" });
    if (ignored.phase === "arming" && !ignored.stopCapture) {
      audioPhaseRef.current = "arming";
      return;
    }

    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      if (audioPhaseRef.current === "arming") return;
      if (recording) {
        audioRecordingSessionRef.current += 1;
        resetAudioRecorder();
        setRecording(false);
        audioPhaseRef.current = "idle";
      }
      return;
    }

    if (recorder.state === "inactive") {
      setRecording(false);
      return;
    }

    try {
      if (typeof recorder.requestData === "function") {
        recorder.requestData();
      }
      recorder.stop();
    } catch {
      resetAudioRecorder();
      setRecording(false);
      audioPhaseRef.current = "idle";
    }
  }

  async function sendMedia() {
    if (!pendingBlob || !pendingType) {
      alert(t("chat_upload_fail"));
      return;
    }
    if (!authReady || !chatId || !canSend) {
      alert(t("chat_load_fail"));
      return;
    }
    if (blockedByAbuse) {
      alert(t("chat_abuse_write_block"));
      return;
    }
    if (!profileUid) {
      alert(t("chat_load_fail"));
      return;
    }

    const senderId = outgoingSender.ok
      ? outgoingSender.sender.fromUid
      : getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    const clientId = crypto.randomUUID();
    const previewType = pendingType;
    const previewSource = pendingSource;
    const previewViewOnce = previewSource === "camera" ? viewOnce : false;
    const replyText = replyQuoteText(replyingTo);
    const blob = pendingBlob;
    const localPreviewUrl = URL.createObjectURL(blob);

    setMessages((old) => [
      ...old,
      {
        id: clientId,
        clientId,
        text: "",
        mine: true,
        fromUid: outgoingSender.ok
          ? outgoingSender.sender.fromUid
          : isOwnerViewing
            ? profileReplyAuthorId(currentUid)
            : senderId,
        senderAuthUid: outgoingSender.ok ? outgoingSender.sender.senderAuthUid : currentUid,
        senderRole: outgoingSender.ok
          ? outgoingSender.sender.senderRole
          : isOwnerViewing
            ? "profile"
            : "anon",
        senderKind: outgoingSender.ok
          ? outgoingSender.sender.senderKind
          : isOwnerViewing
            ? "profile"
            : "anon",
        type: previewType,
        mediaUrl: localPreviewUrl,
        source: previewSource,
        viewOnce: previewViewOnce,
        reply: replyText || undefined,
        status: "sending",
      },
    ]);

    clearPreview();
    setReplyingTo(null);

    try {
      const scanFile = new File(
        [blob],
        previewType,
        { type: blob.type || (previewType === "video" ? "video/webm" : "image/jpeg") },
      );
      const scanResult = await scanUploadFile(scanFile);

      const url = await uploadChatMessageMedia(
        chatId,
        clientId,
        blob,
        previewType,
        (pct) => setUploadProgress(pct),
        { viewOnce: previewViewOnce },
      );

      URL.revokeObjectURL(localPreviewUrl);

      setMessages((old) =>
        old.map((message) =>
          message.clientId === clientId
            ? {
                ...message,
                mediaUrl: url,
                autoModerationRequiresBlur: scanResult.requiresBlur,
                moderationRequiresBlur: scanResult.requiresBlur,
                status: undefined,
              }
            : message,
        ),
      );

      await persistAnonChatMessage({
        chatId,
        username,
        senderId,
        currentUid,
        targetUid: profileUid || chatOwnerUid,
        targetPhoto,
        messageText: "",
        lastMessagePreview: mediaLastMessageLabel(previewType, previewSource),
        type: previewType,
        mediaUrl: url,
        source: previewSource,
        viewOnce: previewViewOnce,
        reply: replyText || undefined,
        existingChatData: chatDocDataRef.current,
        clientId,
        isOwnerReply: provenOwner,
        viewerUsername,
        autoModerationRequiresBlur: scanResult.requiresBlur,
        moderationRequiresBlur: scanResult.requiresBlur,
      });

      if (!provenOwner && identityReady) {
        rememberOwnThreadAnonId(chatId, senderId, {
          authUid: currentUid,
          rootAnonSessionId: rootAnonContinuityId(),
          ownerUncertain: !identityReady,
        });
      }
      messagePersistedRef.current = true;
      setUploadProgress(null);
    } catch (e) {
      console.error(e);
      setMessages((old) =>
        old.map((message) =>
          message.clientId === clientId ? { ...message, status: "error" } : message,
        ),
      );
      const code = String((e as { code?: string }).code || "");
      const message = String((e as Error).message || "");
      const uploadFailed = code.includes("storage") || message.includes("storage");
      alert(
        isChatMediaStorageUnauthorized(e)
          ? t("chat_upload_unauthorized")
          : uploadFailed
            ? t("chat_upload_fail")
            : t("chat_save_fail"),
      );
    }
  }

  function persistOptimisticTextMessage(input: {
    message: Message;
    senderId: string;
    targetUid: string;
    isOwnerReply: boolean;
  }) {
    const clientId = input.message.clientId;
    if (!clientId) return;

    setMessages((old) =>
      old.map((message) =>
        message.clientId === clientId ? { ...message, status: "sending" as const } : message,
      ),
    );

    void persistAnonChatMessage({
      chatId,
      username,
      senderId: input.senderId,
      currentUid,
      targetUid: input.targetUid,
      targetPhoto,
      messageText: input.message.text,
      reply: input.message.reply,
      existingChatData: chatDocDataRef.current,
      isOwnerReply: input.isOwnerReply,
      viewerUsername,
      clientId,
    })
      .then(async (persisted) => {
        const claim = await maybeClaimVerifiedProfileLink({
          chatId: persisted.canonicalChatId,
          messageId: persisted.messageId,
          text: input.message.text,
          ownerUid: currentUid,
        });
        if (claim.ok) {
          setMessages((old) =>
            old.map((message) =>
              message.clientId === clientId
                ? {
                    ...message,
                    id: persisted.messageId,
                    verifiedProfileAttestation: { ticketId: claim.ticketId },
                    status: undefined,
                  }
                : message,
            ),
          );
        } else if (claim.retryable) {
          scheduleVerifiedProfileLinkClaimRetry(currentUid);
        }
        if (!input.isOwnerReply && identityReady) {
          rememberOwnThreadAnonId(chatId, input.senderId, {
            authUid: currentUid,
            rootAnonSessionId: rootAnonContinuityId(),
            ownerUncertain: !identityReady,
          });
        }
        messagePersistedRef.current = true;
        keepComposerFocusRef.current = true;
        refocusComposer();
      })
      .catch((error) => {
        console.error(error);
        if (error instanceof PersistIdentityError) {
          alert(t("chat_load_fail"));
        }
        setMessages((old) =>
          old.map((message) =>
            message.clientId === clientId ? { ...message, status: "error" as const } : message,
          ),
        );
      });
  }

  function retryTextMessage(message: Message) {
    if (
      message.status !== "error" ||
      (message.type && message.type !== "text") ||
      !authReady ||
      !chatId
    ) {
      return;
    }

    const effectiveTargetUid = profileUid || chatOwnerUid;
    if (!effectiveTargetUid && message.senderKind !== "profile") return;

    persistOptimisticTextMessage({
      message,
      senderId:
        message.senderKind === "anon"
          ? message.fromUid || getProfileChatAnonSenderId(chatId, chatAnonSessionId)
          : getProfileChatAnonSenderId(chatId, chatAnonSessionId),
      targetUid: effectiveTargetUid,
      isOwnerReply: message.senderKind === "profile",
    });
  }

  async function sendMessage() {
    if (!text.trim()) return;
    if (!authReady || !chatId || !canSend) return;
    if (blockedByAbuse) {
      alert(t("chat_abuse_write_block"));
      return;
    }

    const effectiveTargetUid = profileUid || chatOwnerUid;
    if (!effectiveTargetUid && !isOwnerViewing) {
      alert(t("chat_load_fail"));
      return;
    }

    const senderId = outgoingSender.ok
      ? outgoingSender.sender.fromUid
      : getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    const isOwnerReply = provenOwner;

    if (anonIdentity.identityChanged && typeof window !== "undefined") {
      const dividerKey = `sayittome:anon-divider:${chatId}`;
      const stored = window.sessionStorage.getItem(dividerKey);
      const nextIndex = messages.length;
      if (stored === null || Number(stored) > nextIndex) {
        window.sessionStorage.setItem(dividerKey, String(nextIndex));
      }
    }

    const messageText = text.trim();
    const clientId = crypto.randomUUID();
    const sendTapAt = Date.now();
    const replyText = replyQuoteText(replyingTo);
    const localMessage = {
      id: clientId,
      clientId,
      text: messageText,
      type: "text" as const,
      mine: true,
      fromUid: outgoingSender.ok
        ? outgoingSender.sender.fromUid
        : isOwnerReply
          ? profileReplyAuthorId(currentUid)
          : senderId,
      senderAuthUid: outgoingSender.ok ? outgoingSender.sender.senderAuthUid : currentUid,
      senderRole: outgoingSender.ok
        ? outgoingSender.sender.senderRole
        : isOwnerReply
          ? "profile"
          : "anon",
      senderKind: (outgoingSender.ok
        ? outgoingSender.sender.senderKind
        : isOwnerReply
          ? "profile"
          : "anon") as Message["senderKind"],
      reply: replyText,
      status: "sending" as const,
      createdAt: { toDate: () => new Date() },
    };

    setMessages((old) => [...old, localMessage]);
    setText("");
    setReplyingTo(null);
    stickToBottomRef.current = true;
    keepComposerFocusRef.current = true;
    scheduleScrollToBottom({ keepKeyboard: true });
    refocusComposer();
    const optimisticEnqueuedAt = Date.now();
    recordQaCriticalEvent("chat", "CHAT_OPTIMISTIC_MESSAGE_ENQUEUED", {
      threadId: chatId,
      clientId,
      localId: localMessage.id,
      senderKind: localMessage.senderKind || "",
      sendTapAt,
      optimisticEnqueuedAt,
      inputClearedAt: optimisticEnqueuedAt,
    });

    if (effectiveTargetUid && !isOwnerReply) {
      void findActiveAbuseBlock({
        receptorUid: effectiveTargetUid,
        blockedAnonId: senderId,
        blockedVisitorId: getVisitorId(),
      })
        .then((block) => {
          if (!block) return;
          setBlockedByAbuse(true);
          setMessages((old) =>
            old.map((message) =>
              message.clientId === clientId ? { ...message, status: "error" as const } : message,
            ),
          );
        })
        .catch(() => undefined);
    }

    persistOptimisticTextMessage({
      message: localMessage,
      senderId,
      targetUid: effectiveTargetUid,
      isOwnerReply,
    });
  }

  function mediaLastMessageLabel(
    type: NonNullable<Message["type"]>,
    source?: Message["source"],
  ) {
    if (type === "audio") return t("chat_media_audio");
    if (type === "video") {
      return source === "camera"
        ? t("chat_media_camera_video")
        : t("chat_media_gallery_video");
    }
    return source === "camera"
      ? t("chat_media_camera_photo")
      : t("chat_media_gallery_photo");
  }

  function sourceLabel(message: Message) {
    if (message.source === "camera" && message.type === "image") return t("chat_media_camera_photo");
    if (message.source === "camera" && message.type === "video") return t("chat_media_camera_video");
    if (message.source === "gallery" && message.type === "image") return t("chat_media_gallery_photo");
    if (message.source === "gallery" && message.type === "video") return t("chat_media_gallery_video");
    if (message.source === "audio") return t("chat_media_audio");
    return "";
  }

  function closeDeleteMenu() {
    setDeleteTarget(null);
    setDeleteStage("choose");
  }

  async function runMessageDelete(mode: "me" | "everyone", target = deleteTarget) {
    if (!target || !chatId) return;
    const messageId = target.id;
    const previous = messages;
    closeDeleteMenu();

    if (mode === "me") {
      rememberLocalHiddenMessage(chatId, messageId);
      setMessages((old) => old.filter((row) => row.id !== messageId && row.clientId !== target.clientId));
    } else {
      setMessages((old) =>
        old.map((row) =>
          row.id === messageId || (target.clientId && row.clientId === target.clientId)
            ? {
                ...row,
                text: DELETED_MESSAGE_PREVIEW,
                mediaUrl: "",
                type: "text" as const,
                storyReply: undefined,
                deletedForEveryone: true,
                source: undefined,
              }
            : row,
        ),
      );
    }

    try {
      const result = await persistMessageDelete({ chatId, messageId, mode });
      if (result?.cleanupPending) {
        queueMessageDelete({
          id: deleteOpId(chatId, messageId, mode),
          chatId,
          messageId,
          mode,
          identity: firebaseUid,
        });
      } else {
        dequeueMessageDelete(deleteOpId(chatId, messageId, mode));
      }
    } catch {
      queueMessageDelete({
        id: deleteOpId(chatId, messageId, mode),
        chatId,
        messageId,
        mode,
        identity: firebaseUid,
      });
      if (mode === "me") {
        forgetLocalHiddenMessage(chatId, messageId);
        setMessages(previous);
      } else if (typeof navigator !== "undefined" && navigator.onLine) {
        setMessages(previous);
        alert(t("chat_delete_fail"));
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      if (mode === "everyone" && typeof navigator !== "undefined" && navigator.onLine) {
        return;
      }
    }
  }

  useEffect(() => {
    function flushQueuedDeletes() {
      const queued = readQueuedMessageDeletes(firebaseUid);
      for (const item of queued) {
        void persistMessageDelete({
          chatId: item.chatId,
          messageId: item.messageId,
          mode: item.mode,
        })
          .then((result) => {
            if (!result?.cleanupPending) dequeueMessageDelete(item.id);
          })
          .catch(() => undefined);
      }
    }
    flushQueuedDeletes();
    window.addEventListener("online", flushQueuedDeletes);
    return () => window.removeEventListener("online", flushQueuedDeletes);
  }, [firebaseUid]);

  const deleteViewer = {
    authUid: firebaseUid,
    profileUid: currentUid,
    anonId: anonSenderId,
    identityReady: authReady,
  };
  const canDeleteTargetForEveryone = Boolean(
    deleteTarget && isCanonicalDeleteAuthor(deleteTarget, deleteViewer),
  );

  const hasMediaPreview = Boolean(audioPreview || imagePreview || videoPreview);

  return (
    <main id="sayittome-chat-page-root" className="sayittome-chat-shell text-white">
      {fullscreenUrl ? (
        <FullscreenMedia url={fullscreenUrl} onClose={() => setFullscreenUrl("")} />
      ) : null}

      <section className={`${CHAT_THREAD_COLUMN_CLASS} bg-black`}>
        <header data-chat-thread-header="1" className={CHAT_THREAD_HEADER_CLASS}>
          <button
            type="button"
            onClick={goBackFromChat}
            className="text-4xl leading-none text-white/70"
            aria-label={t("chats_title")}
          >
            ‹
          </button>

          <StoryAvatarButton
            {...avatarProps}
            size="sm"
            iconSize={26}
            className="!shrink-0"
          />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-[-0.03em]">{displayPeerName}</h1>
            {!isClassic ? (
              <p className="text-lg text-lime-400">{presenceLabel}</p>
            ) : null}
            {blockedByAbuse ? (
              <p className="text-sm font-black text-red-300">{t("chat_abuse_block_active")}</p>
            ) : null}
          </div>

          {isOwnerViewing ? (
            <AbuseProtectionMenu
              receptorUid={profileOwnerUid}
              targetUsername={username}
              chatId={chatId}
              blockedAnonId={anonSenderId}
              blockedBy={currentUid}
            />
          ) : null}
        </header>

        <div
          ref={messagesScrollRef}
          data-stm-no-polish
          data-chat-thread-scroller="1"
          onScroll={() => {
            const node = messagesScrollRef.current;
            if (!node) return;
            const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
            stickToBottomRef.current = distance < 120;
          }}
          className={[
            CHAT_THREAD_SCROLLER_CLASS,
            isClassic ? "px-3 sm:px-4" : "px-5",
            classicChatEngaged ? "pt-3" : "",
          ].join(" ")}
        >
          {hasMoreOlder && messages.length > 0 ? (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={() => {
                  void loadOlderMessages();
                }}
                className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white/70 disabled:opacity-50"
              >
                {loadingOlder ? "Cargando…" : "Cargar mensajes anteriores"}
              </button>
            </div>
          ) : null}
          {showClassicIntro ? (
            <div data-chat-thread-intro="classic" className={CHAT_THREAD_INTRO_CLASS}>
              <div className={CLASSIC_INTRO_INNER_CLASS}>
                <StoryAvatarButton
                  {...avatarProps}
                  size="xl"
                  iconSize={88}
                  className="!scale-100"
                />
                <ClassicAnonPresenceBubble session={anonIdentity.liveLabel} />
              </div>
            </div>
          ) : showClassicIdentityBar ? (
            <p className="border-b border-white/[0.06] px-5 py-2.5 text-center text-xs font-medium text-white/35">
              {t("chat_anon_you_are", { session: anonIdentity.liveLabel })}
            </p>
          ) : showModernVisitorIntro ? (
            <div data-chat-thread-intro="modern" className={CHAT_THREAD_INTRO_CLASS}>
              <div className={MODERN_INTRO_INNER_CLASS}>
                <div className="flex flex-col items-center">
                  <StoryAvatarButton
                    {...avatarProps}
                    size="lg"
                    iconSize={72}
                    className="!scale-100"
                  />

                  <h2 className="mt-6 text-5xl font-black tracking-[-0.08em]">
                    {username}
                  </h2>
                </div>

                <div className="mt-8 rounded-[28px] bg-[#ececec] px-6 py-5 text-left text-black shadow-2xl">
                  <p className="text-2xl font-bold text-violet-600">
                    {t("chat_anon_keep")}
                  </p>

                  <p className="mt-1 text-xl text-zinc-600">
                    {t("chat_anon_identity_hidden")}
                  </p>

                  <p className="mt-3 text-base text-zinc-400">
                    {t("chat_anon_you_are", { session: anonIdentity.liveLabel })}
                  </p>

                  <p className="mt-4 text-sm leading-6 text-zinc-500">
                    {t("chat_anon_message_delivery")}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    {t("chat_anon_reply_alert")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={`${chatWidthClass} flex flex-col ${
              threadIntro.showIntro ? "" : "min-h-full justify-end"
            }`}
          >
            {displayMessages.map((message, index) => {
              const previousFrom = index > 0 ? String(displayMessages[index - 1]?.fromUid || "") : "";
              const currentFrom = String(message.fromUid || "");
              const dividerAnonId = messageAnonSenderId(currentFrom);
              const showIdentityDivider =
                dividerAnonId &&
                shouldShowAnonIdentityDivider(currentFrom, previousFrom);
              const anonSenderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
              const receiptSenderId =
                message.mine && isOwnerViewing
                  ? profileReplyAuthorId(profileOwnerUid || currentUid)
                  : anonSenderId;
              const receiptStatus = resolveMessageReceiptStatus({
                mine: message.mine,
                readBy: message.readBy,
                senderId: receiptSenderId,
                firebaseUid: currentUid,
                isSending: message.status === "sending",
                hasError: message.status === "error",
                chat: chatMetaRef.current ?? undefined,
              });
              const messageUnread = isProfileAnonMessageUnreadForViewer(
                message,
                viewerId,
                currentUid,
                chatMetaRef.current ?? undefined,
              );
              return (
              <div
                key={messageRowKey(message)}
                className={[
                  "flex w-full flex-col",
                  message.mine ? "items-end" : "items-start",
                ].join(" ")}
              >
                {index === anonIdentityChangeInsertIndex ? (
                  <div className="my-3 text-center">
                    <p className="text-[11px] font-medium text-white/30">
                      {t("chat_anon_identity_changed", {
                        session: anonIdentity.liveLabel,
                      })}
                    </p>
                  </div>
                ) : null}
                {showIdentityDivider && !isOwnerViewing ? (
                  <div className="my-3 text-center">
                    <p className="text-[11px] font-medium text-white/30">
                      {t("chat_anon_identity_divider", {
                        session: formatAnonSessionLabel(dividerAnonId),
                      })}
                    </p>
                  </div>
                ) : null}
              <ChatMessageLongPress
                onLongPress={() => {
                  setDeleteTarget(message);
                  setDeleteStage("choose");
                }}
              >
              <ChatSwipeRevealTime
                timeLabel={formatMessageTime(message.createdAt)}
                align={message.mine ? "right" : "left"}
                onSwipeLeftReply={
                  message.deletedForEveryone
                    ? undefined
                    : () => {
                        setReplyingTo(message);
                      }
                }
              >
                <div
                  onDoubleClick={() => {
                    if (message.deletedForEveryone) return;
                    setReplyingTo(message);
                  }}
                  className={chatBubbleShellClass(isClassic, message.mine, messageUnread)}
                >
                  {message.deletedForEveryone ? (
                    <ChatMessageText
                      text={t("chat_message_deleted")}
                      verifiedLink={null}
                      className={chatBubbleTextClass(isClassic, messageUnread)}
                    />
                  ) : (
                    <>
                  {message.reply && (
                    <div className={`mb-2 rounded-md bg-black/30 px-3 py-2 ${isClassic ? "text-sm" : "text-base"} text-zinc-300`}>
                      {message.reply}
                    </div>
                  )}

                  {message.storyReply ? (
                    <div className="mb-2 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                      {message.storyReply.mediaUrl &&
                      message.storyReply.mediaType !== "text" ? (
                        message.storyReply.mediaType === "video" ? (
                          <video
                            src={message.storyReply.mediaUrl}
                            className="max-h-28 w-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={message.storyReply.mediaUrl}
                            alt=""
                            className="max-h-28 w-full object-cover"
                          />
                        )
                      ) : (
                        <div className="flex min-h-16 items-center px-3 py-2 text-xs font-semibold text-white/55">
                          {t("story_reply_expired")}
                        </div>
                      )}
                      {message.storyReply.ownerUsername ? (
                        <p className="px-3 py-1.5 text-xs font-semibold text-white/55">
                          @{message.storyReply.ownerUsername}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {message.viewOnce && (message.type === "image" || message.type === "video") ? (
                    <button
                      onClick={() => {
                        if (!canOpenViewOnce(message.id)) return;
                        markOpened(message.id);
                        setFullscreenUrl(message.mediaUrl || "");
                      }}
                      className="flex min-h-[160px] min-w-[240px] flex-col items-center justify-center rounded-[24px] border border-orange-400/30 bg-orange-500/10 px-6 py-8 text-orange-300"
                    >
                      <Bomb size={42} />
                      <p className="mt-3 text-xl font-black">{t("chat_bomb")}</p>
                      <p className="mt-1 text-sm text-orange-200/70">Ver una sola vez</p>
                    </button>
                  ) : message.type === "audio" ? (
                    <ChatAudioPlayer
                      src={message.mediaUrl || ""}
                      failLabel={t("chat_audio_play_fail")}
                    />
                  ) : message.type === "image" ? (
                    <SensitiveMediaShell
                      url={message.mediaUrl}
                      staticRequiresBlur={messageRequiresBlur(message)}
                      message={message}
                      enableRuntimeScan={!message.viewOnce}
                      className="inline-block"
                    >
                      <button
                        onClick={() => {
                          if (message.viewOnce) {
                            if (!canOpenViewOnce(message.id)) return;
                            markOpened(message.id);
                          }

                          setFullscreenUrl(message.mediaUrl || "");
                        }}
                      >
                        <img
                          src={message.mediaUrl || ""}
                          className="max-h-[420px] rounded-[24px]"
                        />
                      </button>
                    </SensitiveMediaShell>
                  ) : message.type === "video" ? (
                    <SensitiveMediaShell
                      url={message.mediaUrl}
                      mediaType="video"
                      staticRequiresBlur={messageRequiresBlur(message)}
                      message={message}
                      enableRuntimeScan={!message.viewOnce}
                      className="inline-block"
                    >
                      <video
                        src={message.mediaUrl || ""}
                        controls
                        className="max-h-[420px] rounded-[24px]"
                      />
                    </SensitiveMediaShell>
                  ) : (
                    <ChatMessageText
                      text={message.text}
                      verifiedLink={null}
                      className={chatBubbleTextClass(isClassic, messageUnread)}
                    />
                  )}
                    </>
                  )}

                  {sourceLabel(message) ? (
                    <p className="mt-2 text-right text-xs uppercase tracking-[0.18em] text-white/45">
                      {message.viewOnce ? "bomba · " : ""}
                      {sourceLabel(message)}
                    </p>
                  ) : null}
                </div>
              </ChatSwipeRevealTime>
              </ChatMessageLongPress>

              <ChatOfficialProfileVerifiedBadge
                chatId={verifiedLinkChatId}
                messageId={message.id}
                text={message.text}
                deleted={message.deletedForEveryone}
                attestationHint={message.verifiedProfileAttestation}
                mine={message.mine}
                isClassic={isClassic}
              />

              <div
                className={[
                  "mb-2.5 flex min-h-[18px] w-full flex-col",
                  message.mine ? "items-end pr-0.5" : "items-start pl-0.5",
                ].join(" ")}
              >
                {receiptStatus ? (
                  <ChatMessageReceipt
                    status={receiptStatus}
                    onRetry={
                      receiptStatus === "error" &&
                      (!message.type || message.type === "text")
                        ? () => retryTextMessage(message)
                        : undefined
                    }
                    retryLabel={t("chat_retry")}
                  />
                ) : null}
              </div>
              </div>
            );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {cameraMode ? (
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 px-5">
            <video
              ref={cameraVideoElementRef}
              autoPlay
              playsInline
              muted
              className="max-h-[70vh] w-full max-w-3xl rounded-[28px] bg-black object-cover"
            />

            <div className="mt-5 flex items-center gap-3">
              {cameraMode === "photo" ? (
                <button
                  type="button"
                  onClick={captureRealPhoto}
                  className="rounded-2xl bg-violet-500 px-6 py-4 text-lg font-black"
                >
                  Tomar foto
                </button>
              ) : recording ? (
                <button
                  type="button"
                  onClick={stopRealVideoRecording}
                  className="rounded-2xl bg-red-500 px-6 py-4 text-lg font-black"
                >
                  Detener video
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRealVideoRecording}
                  className="rounded-2xl bg-violet-500 px-6 py-4 text-lg font-black"
                >
                  Grabar video
                </button>
              )}

              <button
                type="button"
                onClick={closeRealCamera}
                className="rounded-2xl bg-white/10 px-6 py-4 text-lg font-black"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <div
          data-chat-thread-composer="1"
          className={[
            CHAT_THREAD_COMPOSER_CLASS,
            "border-t border-white/5 bg-black/95 px-4 pt-3 backdrop-blur-xl",
            hasMediaPreview ? "sayittome-chat-composer--preview" : "",
          ].join(" ")}
        >
          {replyingTo && (
            <div className={`${chatWidthClass} mb-3 rounded-3xl bg-[#090909] px-5 py-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-violet-400">Respondiendo</p>
                  <p className="mt-1 text-lg text-zinc-400">{replyQuoteText(replyingTo)}</p>
                </div>

                <button onClick={() => setReplyingTo(null)} className="text-zinc-500">
                  <X size={26} />
                </button>
              </div>
            </div>
          )}

          {hasMediaPreview ? (
            <div className={`${chatWidthClass} sayittome-chat-media-preview rounded-[28px] bg-[#070707] p-4`}>
              <div className="sayittome-chat-media-preview-body">
                {audioPreview ? (
                  <ChatAudioPlayer
                    src={audioPreview}
                    failLabel={t("chat_audio_play_fail")}
                  />
                ) : null}

                {imagePreview ? (
                  pendingSource === "camera" && viewOnce ? (
                    <div className="flex min-h-[140px] flex-col items-center justify-center rounded-[22px] border border-orange-400/30 bg-orange-500/10 text-orange-300">
                      <Bomb size={44} />
                      <p className="mt-3 text-xl font-black">Bomba activada</p>
                      <p className="mt-1 text-sm text-orange-200/70">La imagen no se vera hasta abrirse una vez</p>
                    </div>
                  ) : (
                    <img
                      src={imagePreview}
                      alt=""
                      className="sayittome-chat-media-preview-visual mx-auto max-w-full rounded-[22px] object-contain"
                    />
                  )
                ) : null}

                {videoPreview ? (
                  pendingSource === "camera" && viewOnce ? (
                    <div className="flex min-h-[140px] flex-col items-center justify-center rounded-[22px] border border-orange-400/30 bg-orange-500/10 text-orange-300">
                      <Bomb size={44} />
                      <p className="mt-3 text-xl font-black">Bomba activada</p>
                      <p className="mt-1 text-sm text-orange-200/70">El video no se vera hasta abrirse una vez</p>
                    </div>
                  ) : (
                    <video
                      src={videoPreview}
                      controls
                      className="sayittome-chat-media-preview-visual mx-auto max-w-full rounded-[22px] object-contain"
                    />
                  )
                ) : null}
              </div>

              <div className="sayittome-chat-media-preview-actions">
                {pendingSource === "camera" ? (
                  <button
                    type="button"
                    onClick={() => setViewOnce((v) => !v)}
                    className={[
                      "flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition",
                      viewOnce
                        ? "border-orange-400/40 bg-orange-500/15 text-orange-300"
                        : "border-white/10 bg-white/[0.04] text-white/60",
                    ].join(" ")}
                  >
                    <Bomb size={18} />
                    {viewOnce
                      ? "Bomba activada: se vera una sola vez"
                      : "Activar bomba: ver una sola vez"}
                  </button>
                ) : null}

                {uploadProgress !== null ? (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
                    <div
                      className="h-full bg-violet-500"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                ) : null}

                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      void sendMedia();
                    }}
                    className="rounded-2xl bg-violet-500/80 px-5 py-3 text-lg font-bold"
                  >
                    Enviar
                  </button>

                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      clearPreview();
                    }}
                    className="rounded-2xl bg-white/[0.07] px-5 py-3 text-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {!hasMediaPreview && micNotice ? (
            <div className={`${chatWidthClass} mb-3 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-center text-sm text-white/80`}>
              <p>
                {micNotice === "blocked"
                  ? t("chat_mic_permission_blocked")
                  : micNotice === "denied"
                    ? t("chat_mic_permission_denied")
                    : t("chat_mic_fail")}
              </p>
              {micNotice === "blocked" ? (
                <button
                  type="button"
                  className="mt-2 text-sm font-bold text-violet-300"
                  onClick={() => openChatMicrophoneSettings()}
                >
                  {t("chat_mic_open_settings")}
                </button>
              ) : null}
            </div>
          ) : null}

          {!hasMediaPreview ? (
          <div className={`${chatWidthClass} flex items-center gap-2`}>
            <input
              ref={cameraPhotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className={CHAT_FILE_INPUT_CLASS}
              onChange={(e) => {
                handleFile(e.target.files?.[0] || null, "camera");
                e.target.value = "";
              }}
            />

            <input
              ref={cameraVideoRef}
              type="file"
              accept="video/*"
              capture="environment"
              className={CHAT_FILE_INPUT_CLASS}
              onChange={(e) => {
                handleFile(e.target.files?.[0] || null, "camera");
                e.target.value = "";
              }}
            />

            <input
              ref={galleryRef}
              type="file"
              accept="image/*,video/*"
              className={CHAT_FILE_INPUT_CLASS}
              onChange={(e) => {
                handleFile(e.target.files?.[0] || null, "gallery");
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => openRealCamera("photo")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80"
              title="Foto camara"
            >
              <Camera size={19} />
            </button>

            <button
              type="button"
              onClick={() => openRealCamera("video")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80"
              title="Video camara"
            >
              <Video size={19} />
            </button>

            <button
              type="button"
              onClick={() => openGalleryPicker()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80"
              title="Galeria"
            >
              <ImageIcon size={19} />
            </button>

            <div className="flex h-11 flex-1 items-center rounded-2xl border border-white/5 bg-[#090909] px-4">
              <input
                ref={inputRef}
                data-sayittome-chat-composer
                value={text}
                onFocus={() => {
                  resetChatBackNavigationState();
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    if (document.activeElement !== inputRef.current) {
                      keepComposerFocusRef.current = false;
                    }
                  }, 0);
                }}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (canSend) sendMessage();
                  }
                }}
                placeholder={canSend ? "Escribi un mensaje..." : "Esperando sesión..."}
                disabled={!canSend}
                className="w-full bg-transparent text-base outline-none placeholder:text-white/30 disabled:opacity-50"
              />
            </div>

            <ChatAudioHoldLockMic
              recording={recording}
              disabled={!canSend}
              onStart={() => {
                void startAudioRecording();
              }}
              onStop={stopAudioRecording}
              onCancel={cancelAudioRecording}
            />

            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                event.preventDefault();
                if (canSend && text.trim()) {
                  sendMessage();
                }
              }}
              onClick={(event) => {
                event.preventDefault();
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/80 text-white"
              title="Enviar"
            >
              {text.trim() ? <Send size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
          ) : null}
        </div>
      </section>
      <ChatMessageDeleteMenu
        open={Boolean(deleteTarget)}
        canDeleteForEveryone={canDeleteTargetForEveryone}
        stage={deleteStage}
        onChooseMe={() => setDeleteStage("confirm-me")}
        onChooseEveryone={() => setDeleteStage("confirm-everyone")}
        onConfirmMe={() => void runMessageDelete("me")}
        onConfirmEveryone={() => void runMessageDelete("everyone")}
        onClose={closeDeleteMenu}
        labels={{
          forMe: t("chat_delete_for_me"),
          forEveryone: t("chat_delete_for_everyone"),
          confirmMe: t("chat_delete_confirm_me"),
          confirmEveryone: t("chat_delete_confirm_everyone"),
          confirm: t("chat_delete_confirm"),
          cancel: t("common_cancel"),
        }}
      />
    </main>
  );
}

