"use client";

import {
  ArrowUp,
  Bomb,
  Camera,
  Image as ImageIcon,
  Mic,
  Play,
  Send,
  UserRound,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import SensitiveMediaShell from "@/components/moderation/SensitiveMediaShell";
import AudioWave from "@/components/chat/media/AudioWave";
import ChatSwipeRevealTime from "@/components/chat/ChatSwipeRevealTime";
import FullscreenMedia from "@/components/chat/media/FullscreenMedia";
import { uploadMedia } from "@/lib/media/upload";
import {
  captureChatPhotoFromCamera,
  ensureChatCameraStreamPermission,
  openNativeGalleryFilePicker,
  pickChatPhotoFromGallery,
} from "@/lib/media/chatMediaCapture";
import { canOpenViewOnce, markOpened } from "@/lib/media/viewOnce";
import AbuseProtectionMenu from "@/components/chat/AbuseProtectionMenu";
import ChatMessageReceipt from "@/components/chat/ChatMessageReceipt";
import ClassicAnonPresenceBubble from "@/components/chat/ClassicAnonPresenceBubble";
import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import { useUxMode } from "@/contexts/UxModeContext";
import { useMainTabShell } from "@/contexts/MainTabShellContext";
import { findActiveAbuseBlock } from "@/lib/abuse/anonAbuseBlocks";
import { getVisitorId } from "@/lib/abuse/fingerprint";
import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import { getAnonSessionId } from "@/lib/chat/anonSession";
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
import { unregisterSessionChat, registerSessionChat } from "@/lib/chat/sessionChats";
import {
  profileReplyAuthorId,
  resolveProfileAnonMessageMine,
} from "@/lib/chat/profileAnonMessageAuthor";
import type { InboxChat } from "@/hooks/useChatsInbox";
import { inboxChatFromFirestore, markChatAsRead } from "@/lib/chat/unread";
import {
  formatAnonSessionLabel,
} from "@/lib/chat/inboxPeerTitle";
import { messageRequiresBlur, profilePhotoRequiresBlur } from "@/lib/moderation/blur";
import { firestoreScanFields, scanUploadFile } from "@/lib/moderation/scanMedia";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import { getCachedProfile, setCachedProfile, getCachedFullProfile } from "@/lib/profile/profileCache";
import {
  cachedMessageToUi,
  readCachedChatMessages,
  uiMessageToCached,
  writeCachedChatMessages,
} from "@/lib/chat/chatMessageCache";
import { chatBubbleShellClass, chatBubbleTextClass } from "@/lib/chat/chatBubbleStyles";
import { persistAnonChatMessage } from "@/lib/chat/persistAnonMessage";
import { prefetchChatThread } from "@/lib/chat/prefetchChatThread";
import { useFormatLastSeen } from "@/hooks/useLocaleFormatters";
import { useChatViewportLock } from "@/hooks/useChatViewportLock";
import { markChatMessagesWhipAlerted } from "@/lib/chat/whipAlertDedupe";
import { useT } from "@/contexts/LocaleContext";
import { fastRouterPush, fastRouterReplace } from "@/lib/navigation/fastNavigate";
import { resolveChatBackDestination } from "@/lib/navigation/nativeBack";
import { isMainTabHref } from "@/lib/navigation/mainTabs";
import { openMainTabFromBridge } from "@/lib/navigation/mainTabShellBridge";
import {
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";


type Message = {
  id: string;
  text: string;
  mine: boolean;
  fromUid?: string;
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
        `${messageRowKey(message)}:${message.mine ? 1 : 0}:${message.status || ""}:${message.text}:${message.mediaUrl || ""}`,
    )
    .join("|");
}

function resolveMessageMineForViewer(
  message: Pick<Message, "fromUid">,
  input: {
    chatId: string;
    chatAnonSessionId: string;
    currentUid: string;
    targetUid: string;
    chatOwnerUid: string;
  },
) {
  const profileUid = input.targetUid || input.chatOwnerUid;
  const isOwnerViewing = Boolean(
    input.currentUid && profileUid && input.currentUid === profileUid,
  );
  const threadAnonId = getProfileChatAnonSenderId(input.chatId, input.chatAnonSessionId);
  const from = String(message.fromUid || "");

  return resolveProfileAnonMessageMine({
    from,
    threadAnonId,
    profileUid,
    isOwnerViewing,
    ownerUid: input.currentUid,
  });
}

function mergeLoadedChatMessages(loaded: Message[], pending: Message[]) {
  const merged = loaded.map((message) => ({ ...message }));

  for (const optimistic of pending) {
    const matchIndex = merged.findIndex(
      (message) =>
        message.mine === optimistic.mine &&
        message.text === optimistic.text &&
        (message.type || "text") === (optimistic.type || "text") &&
        (message.mediaUrl || "") === (optimistic.mediaUrl || ""),
    );

    if (matchIndex >= 0) {
      if (optimistic.clientId) {
        merged[matchIndex] = {
          ...merged[matchIndex],
          clientId: optimistic.clientId,
          status: undefined,
        };
      }
      continue;
    }

    merged.push(optimistic);
  }

  return merged;
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
    pathname.startsWith("/chat") && !shell.childrenHidden;
  const formatLastSeen = useFormatLastSeen();
  const [messages, setMessages] = useState<Message[]>(() => {
    const cached = readCachedChatMessages(chatId);
    return cached?.map((row) => cachedMessageToUi(row) as Message) ?? [];
  });
  const [chatSurfaceEngaged, setChatSurfaceEngaged] = useState(
    () => (readCachedChatMessages(chatId)?.length ?? 0) > 0,
  );
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState("");
  const [audioPreview, setAudioPreview] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingType, setPendingType] = useState<"audio" | "image" | "video" | null>(null);
  const [pendingSource, setPendingSource] = useState<"camera" | "gallery" | "audio" | undefined>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [anonSession, setAnonSession] = useState("anon_server");
  const [authReady, setAuthReady] = useState(false);
  const [currentUid, setCurrentUid] = useState("");
  const [targetUid, setTargetUid] = useState("");
  const [targetPhoto, setTargetPhoto] = useState("");
  const [targetBlurPhoto, setTargetBlurPhoto] = useState(false);
  const [targetLastActive, setTargetLastActive] = useState("");
  const [targetOnline, setTargetOnline] = useState(false);
  const [targetShowsLastSeen, setTargetShowsLastSeen] = useState(true);
  const [blockedByAbuse, setBlockedByAbuse] = useState(false);
  const [chatAnonSessionId, setChatAnonSessionId] = useState("");
  const [chatOwnerUid, setChatOwnerUid] = useState("");
  const [recording, setRecording] = useState(false);
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
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const keyboardAnimatingRef = useRef(false);
  const readMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReadMarkRef = useRef<{ chatId: string; viewerId: string } | null>(null);
  const chatMetaRef = useRef<InboxChat | null>(null);
  const chatDocDataRef = useRef<Record<string, unknown>>({});
  const threadContextRef = useRef({
    chatId: "",
    currentUid: "",
    targetUid: "",
    chatOwnerUid: "",
    chatAnonSessionId: "",
    isOwnerViewing: false,
    profileUid: "",
  });

  function scrollChatToBottom() {
    const node = messagesScrollRef.current;
    const end = messagesEndRef.current;
    if (end) {
      end.scrollIntoView({ block: "end" });
    } else if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }

  function scheduleScrollToBottom() {
    stickToBottomRef.current = true;
    const run = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollChatToBottom);
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
    requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }

  function goBackFromChat() {
    const dest = resolveChatBackDestination(pathname);
    fastRouterReplace(router, dest);
    if (isMainTabHref(dest)) {
      openMainTabFromBridge(dest);
    }
  }

  function markOpenChatAsRead() {
    const ctx = markReadContextRef.current;
    const chat = chatMetaRef.current;
    if (!ctx.chatId || !ctx.authReady || !chat) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const senderId = getProfileChatAnonSenderId(ctx.chatId, ctx.chatAnonSessionId);
    const profileOwnerUid = ctx.targetUid || ctx.chatOwnerUid;
    const ownerViewing = Boolean(
      ctx.currentUid && profileOwnerUid && ctx.currentUid === profileOwnerUid,
    );
    const messageViewerId = ownerViewing ? ctx.currentUid : senderId;

    if (!messageViewerId) return;

    void markChatAsRead(ctx.chatId, messageViewerId, chat, ctx.currentUid).catch(
      () => undefined,
    );
  }

  useEffect(() => {
    document.body.classList.toggle("sayittome-chat-fullscreen-open", Boolean(fullscreenUrl));
    return () => {
      document.body.classList.remove("sayittome-chat-fullscreen-open");
    };
  }, [fullscreenUrl]);

  useEffect(() => {
    const onBack = () => setFullscreenUrl("");
    window.addEventListener("sayittome:close-chat-fullscreen", onBack);
    return () => window.removeEventListener("sayittome:close-chat-fullscreen", onBack);
  }, []);

  useChatViewportLock(chatViewportLockActive);

  useEffect(() => {
    setAnonSession(getAnonSessionId());

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || "");
      setAuthReady(true);
    });

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      keyboardAnimatingRef.current = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        keyboardAnimatingRef.current = false;
        if (!stickToBottomRef.current) return;
        scheduleScrollToBottom();
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
    const cached = readCachedChatMessages(chatId);
    if (cached?.length) {
      setMessages(cached.map((row) => cachedMessageToUi(row) as Message));
      setChatSurfaceEngaged(true);
    }
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    registerSessionChat(chatId);
  }, [chatId]);

  useEffect(() => {
    messagePersistedRef.current = false;

    return () => {
      if (messagePersistedRef.current) return;

      void (async () => {
        const hasActivity = await chatHasActivity(chatId);
        if (hasActivity) return;

        await deleteEmptyChatIfIdle(chatId);
        unregisterSessionChat(chatId);
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

    setChatOwnerUid("");

    const unsub = onSnapshot(doc(db, "chats", chatId), (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() as Record<string, unknown> | undefined;
      chatDocDataRef.current = data || {};
      setChatAnonSessionId(String(data?.anonSessionId || ""));
      setChatOwnerUid(
        String(data?.receptorUid || data?.targetUid || data?.anonOwnerUid || ""),
      );
      chatMetaRef.current = inboxChatFromFirestore(chatId, data, username);
      markOpenChatAsRead();
    });

    return () => {
      if (readMarkTimerRef.current) {
        clearTimeout(readMarkTimerRef.current);
        readMarkTimerRef.current = null;
      }
      markOpenChatAsRead();
      unsub();
    };
  }, [chatId, username]);

  useEffect(() => {
    let cancelled = false;

    async function loadTargetProfile() {
      const cachedLite = getCachedProfile(username);
      const cachedFull = getCachedFullProfile(username) as Record<string, unknown> | null;

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

    void loadTargetProfile();

    return () => {
      cancelled = true;
    };
  }, [username, chatId]);

  const isClassic = uxMode === "classic";
  const profileOwnerUid = targetUid || chatOwnerUid;
  const isOwnerViewing = Boolean(
    currentUid && profileOwnerUid && currentUid === profileOwnerUid,
  );
  const profileUid = profileOwnerUid || targetUid;
  threadContextRef.current = {
    chatId,
    currentUid,
    targetUid,
    chatOwnerUid,
    chatAnonSessionId,
    isOwnerViewing,
    profileUid,
  };
  const presenceLabel =
    targetShowsLastSeen && !isOwnerViewing
      ? formatLastSeen(targetLastActive, targetOnline)
      : "";
  const anonSenderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
  const viewerId = isOwnerViewing ? currentUid : anonSenderId;
  const hasChatActivity = messages.length > 0;
  const classicChatEngaged =
    isClassic &&
    (isOwnerViewing
      ? hasChatActivity
      : messages.some((message) => message.mine) || hasChatActivity);
  const showClassicIntro = isClassic && !isOwnerViewing && !chatSurfaceEngaged;
  const showModernVisitorIntro = !isClassic && !isOwnerViewing && !chatSurfaceEngaged;
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
        messages,
        anonIdentity.threadAnonId,
        anonIdentity.liveAnonId,
      )
    : -1;
  const showClassicIdentityBar =
    isClassic &&
    !isOwnerViewing &&
    !showClassicIntro &&
    !(showAnonIdentityNotice && hasChatActivity);
  const chatWidthClass = isClassic ? "w-full" : "mx-auto max-w-5xl";
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

  useEffect(() => {
    if (messages.length > 0) {
      setChatSurfaceEngaged(true);
    }
  }, [messages.length]);

  useEffect(() => {
    markOpenChatAsRead();
  }, [chatId, authReady, currentUid, targetUid, chatOwnerUid, chatAnonSessionId]);

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

    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limitToLast(50),
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const ctx = threadContextRef.current;
        const senderId = getProfileChatAnonSenderId(ctx.chatId, ctx.chatAnonSessionId);
        const resolvedProfileUid = ctx.profileUid || ctx.chatOwnerUid;
        const ownerViewing = ctx.isOwnerViewing;
        const messageViewerId = ownerViewing ? ctx.currentUid : senderId;

        const loaded: Message[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as {
            texto?: string;
            text?: string;
            fromUid?: string;
            ownerId?: string;
            senderUid?: string;
            senderKind?: string;
            mine?: boolean;
            reply?: string;
            storyReply?: Message["storyReply"];
            readBy?: Record<string, boolean>;
            type?: Message["type"];
            mediaUrl?: string;
            source?: Message["source"];
            viewOnce?: boolean;
            createdAt?: { toDate?: () => Date };
            autoModerationRequiresBlur?: boolean;
            moderationRequiresBlur?: boolean;
          };

          const from = String(
            data.fromUid || data.ownerId || data.senderUid || "",
          );
          const mine = resolveProfileAnonMessageMine({
            senderKind: data.senderKind,
            from,
            threadAnonId: senderId,
            profileUid: resolvedProfileUid,
            isOwnerViewing: ownerViewing,
            ownerUid: ctx.currentUid,
          });

          return {
            id: docSnap.id,
            text: String(data.texto || data.text || ""),
            mine,
            fromUid: from,
            reply: data.reply,
            storyReply: data.storyReply,
            type: data.type,
            mediaUrl: data.mediaUrl,
            source: data.source,
            viewOnce: data.viewOnce,
            autoModerationRequiresBlur: data.autoModerationRequiresBlur === true,
            moderationRequiresBlur: data.moderationRequiresBlur === true,
            readBy: data.readBy || {},
            createdAt: data.createdAt,
          };
        });

        setMessages((prev) => {
          const pending = prev.filter((message) => message.status === "sending");
          const merged = mergeLoadedChatMessages(loaded, pending);
          if (chatMessagesSignature(prev) === chatMessagesSignature(merged)) {
            return prev;
          }
          return merged;
        });

        writeCachedChatMessages(chatId, loaded.map(uiMessageToCached));

        markChatMessagesWhipAlerted(
          chatId,
          snapshot.docs.map((docSnap) => docSnap.id),
        );

        if (!messageViewerId) return;

        pendingReadMarkRef.current = { chatId, viewerId: messageViewerId };
        if (readMarkTimerRef.current) clearTimeout(readMarkTimerRef.current);

        readMarkTimerRef.current = setTimeout(() => {
          const pending = pendingReadMarkRef.current;
          if (!pending || pending.chatId !== chatId || pending.viewerId !== messageViewerId) {
            return;
          }

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

        markOpenChatAsRead();
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
  }, [chatId, authReady, chatAnonSessionId, currentUid, targetUid, chatOwnerUid]);

  useEffect(() => {
    if (!chatId || !authReady) return;

    setMessages((prev) => {
      if (prev.length === 0) return prev;

      let changed = false;
      const next = prev.map((message) => {
        const mine = resolveMessageMineForViewer(message, {
          chatId,
          chatAnonSessionId,
          currentUid,
          targetUid,
          chatOwnerUid,
        });
        if (mine === message.mine) return message;
        changed = true;
        return { ...message, mine };
      });

      return changed ? next : prev;
    });
  }, [chatId, authReady, chatAnonSessionId, currentUid, targetUid, chatOwnerUid]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scheduleScrollToBottom();
  }, [messages.length]);

  async function openRealCamera(mode: "photo" | "video") {
    if (mode === "photo") {
      const nativePhoto = await captureChatPhotoFromCamera();
      if (nativePhoto) {
        handleFile(nativePhoto.file, nativePhoto.source);
        return;
      }
    }

    const allowed = await ensureChatCameraStreamPermission(mode === "video");
    if (!allowed) {
      alert(t("chat_camera_fail"));
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
    } catch {
      alert(t("chat_camera_fail"));
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

  function clearPreview() {
    setAudioPreview("");
    setImagePreview("");
    setVideoPreview("");
    setPendingBlob(null);
    setPendingType(null);
    setPendingSource(undefined);
    setUploadProgress(null);
    setViewOnce(false);
  }

  function handleFile(file: File | null, source: "camera" | "gallery") {
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const url = URL.createObjectURL(file);

    setPendingBlob(file);
    setPendingType(isVideo ? "video" : "image");
    setPendingSource(source);
    setImagePreview(isVideo ? "" : url);
    setVideoPreview(isVideo ? url : "");
  }

  async function openGalleryPicker() {
    const nativePhoto = await pickChatPhotoFromGallery();
    if (nativePhoto) {
      handleFile(nativePhoto.file, nativePhoto.source);
      return;
    }

    const opened = await openNativeGalleryFilePicker(galleryRef.current);
    if (!opened) {
      alert(t("chat_camera_fail"));
    }
  }

  async function startAudioRecording() {
    const allowed = await ensureChatCameraStreamPermission(true);
    if (!allowed) {
      alert(t("chat_camera_fail"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);

        setPendingBlob(blob);
        setPendingType("audio");
        setPendingSource("audio");
        setAudioPreview(url);
        setRecording(false);

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecording(true);
    } catch {
      alert(t("chat_mic_fail"));
      setRecording(false);
    }
  }

  function stopAudioRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function sendMedia() {
    if (!pendingBlob || !pendingType || !authReady || !chatId) return;
    if (blockedByAbuse) {
      alert(t("chat_abuse_write_block"));
      return;
    }
    if (!profileUid) {
      alert(t("chat_load_fail"));
      return;
    }

    const senderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    const clientId = crypto.randomUUID();
    const previewType = pendingType;
    const previewSource = pendingSource;
    const previewViewOnce = viewOnce;
    const blob = pendingBlob;

    setMessages((old) => [
      ...old,
      {
        id: clientId,
        clientId,
        text: previewType === "audio" ? t("chat_media_audio") : "",
        mine: true,
        type: previewType,
        source: previewSource,
        viewOnce: previewViewOnce,
        status: "sending",
      },
    ]);

    clearPreview();

    try {
      const scanFile = new File(
        [blob],
        previewType,
        { type: blob.type || (previewType === "video" ? "video/webm" : "image/jpeg") },
      );
      const scanFields = firestoreScanFields(await scanUploadFile(scanFile));

      const url = await uploadMedia(
        `chat_media/${Date.now()}`,
        blob,
        (pct) => setUploadProgress(pct),
      );

      setMessages((old) =>
        old.map((message) =>
          message.clientId === clientId
            ? { ...message, mediaUrl: url, status: undefined }
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
        messageText:
          previewType === "audio"
            ? t("chat_media_audio")
            : previewType === "video"
              ? t("chat_media_camera_video")
              : t("chat_media_gallery_photo"),
        type: previewType,
        mediaUrl: url,
        source: previewSource,
        viewOnce: previewViewOnce,
        ...scanFields,
        existingChatData: chatDocDataRef.current,
      });

      messagePersistedRef.current = true;
      setUploadProgress(null);
    } catch (e) {
      console.error(e);
      setMessages((old) =>
        old.map((message) =>
          message.clientId === clientId ? { ...message, status: "error" } : message,
        ),
      );
      alert(t("chat_save_fail"));
    }
  }

  async function sendMessage() {
    if (!text.trim()) return;
    if (!authReady || !chatId) return;
    if (blockedByAbuse) {
      alert(t("chat_abuse_write_block"));
      return;
    }

    const effectiveTargetUid = profileUid || chatOwnerUid;
    if (!effectiveTargetUid && !isOwnerViewing) {
      alert(t("chat_load_fail"));
      return;
    }

    const senderId = anonIdentity.identityChanged
      ? getAnonSessionId()
      : getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    const isOwnerReply = isOwnerViewing;

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
    const replyText = replyingTo?.text;
    const localMessage = {
      id: clientId,
      clientId,
      text: messageText,
      mine: true,
      fromUid: senderId,
      reply: replyText,
      status: "sending" as const,
      createdAt: { toDate: () => new Date() },
    };

    setMessages((old) => [...old, localMessage]);
    setText("");
    setReplyingTo(null);
    stickToBottomRef.current = true;
    scheduleScrollToBottom();
    refocusComposer();

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

    void persistAnonChatMessage({
      chatId,
      username,
      senderId,
      currentUid,
      targetUid: effectiveTargetUid,
      targetPhoto,
      messageText,
      reply: replyText,
      existingChatData: chatDocDataRef.current,
    })
      .then(() => {
        messagePersistedRef.current = true;
        refocusComposer();
      })
      .catch((e) => {
        console.error(e);
        setMessages((old) =>
          old.map((message) =>
            message.clientId === clientId ? { ...message, status: "error" as const } : message,
          ),
        );
        alert(t("chat_save_fail"));
      });
  }

  function sourceLabel(message: Message) {
    if (message.source === "camera" && message.type === "image") return t("chat_media_camera_photo");
    if (message.source === "camera" && message.type === "video") return t("chat_media_camera_video");
    if (message.source === "gallery" && message.type === "image") return t("chat_media_gallery_photo");
    if (message.source === "gallery" && message.type === "video") return t("chat_media_gallery_video");
    if (message.source === "audio") return t("chat_media_audio");
    return "";
  }

  return (
    <main id="sayittome-chat-page-root" className="sayittome-chat-shell text-white">
      {fullscreenUrl ? (
        <FullscreenMedia url={fullscreenUrl} onClose={() => setFullscreenUrl("")} />
      ) : null}

      <section className="flex h-full min-h-0 flex-col bg-black">
        <header className="flex shrink-0 items-center gap-4 bg-black px-5 py-4">
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

        {isClassic && !isOwnerViewing && !chatSurfaceEngaged ? (
          <div className="shrink-0">
            <div className="flex flex-col items-center justify-center px-6 pb-2 pt-[min(12vh,5rem)]">
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
        ) : !isClassic && !isOwnerViewing && !chatSurfaceEngaged ? (
          <div className="shrink-0">
            <div className="flex min-h-[42vh] flex-col items-center justify-center px-6">
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
              </div>
            </div>
          </div>
        ) : null}

        <div
          ref={messagesScrollRef}
          data-stm-no-polish
          onScroll={() => {
            const node = messagesScrollRef.current;
            if (!node) return;
            const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
            stickToBottomRef.current = distance < 120;
          }}
          className={[
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            isClassic ? "px-3 sm:px-4" : "px-5",
            classicChatEngaged ? "pt-3" : "",
          ].join(" ")}
        >
          <div className={`${chatWidthClass} flex min-h-full flex-col justify-end`}>
            {messages.map((message, index) => {
              const previousFrom = index > 0 ? String(messages[index - 1]?.fromUid || "") : "";
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
              });

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
              <ChatSwipeRevealTime
                timeLabel={formatMessageTime(message.createdAt)}
                align={message.mine ? "right" : "left"}
              >
                <div
                  onDoubleClick={() => setReplyingTo(message)}
                  className={chatBubbleShellClass(isClassic, message.mine)}
                >
                  {message.reply && (
                    <div className={`mb-2 rounded-md bg-black/30 px-3 py-2 ${isClassic ? "text-sm" : "text-base"} text-zinc-300`}>
                      {message.reply}
                    </div>
                  )}

                  {message.storyReply?.mediaUrl ? (
                    <div className="mb-2 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                      <img
                        src={message.storyReply.mediaUrl}
                        alt=""
                        className="max-h-28 w-full object-cover"
                      />
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
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => {
                          const a = new Audio(message.mediaUrl || "");
                          a.play();
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20"
                      >
                        <Play size={18} />
                      </button>

                      <AudioWave url={message.mediaUrl || ""} />
                    </div>
                  ) : message.type === "image" ? (
                    <SensitiveMediaShell
                      url={message.mediaUrl}
                      staticRequiresBlur={messageRequiresBlur(message)}
                      message={message}
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
                      className="inline-block"
                    >
                      <video
                        src={message.mediaUrl || ""}
                        controls
                        className="max-h-[420px] rounded-[24px]"
                      />
                    </SensitiveMediaShell>
                  ) : (
                    <p className={chatBubbleTextClass(isClassic)}>
                      {message.text}
                    </p>
                  )}

                  {sourceLabel(message) ? (
                    <p className="mt-2 text-right text-xs uppercase tracking-[0.18em] text-white/45">
                      {message.viewOnce ? "bomba · " : ""}
                      {sourceLabel(message)}
                    </p>
                  ) : null}
                </div>
              </ChatSwipeRevealTime>

              <div
                className={[
                  "mb-2.5 flex min-h-[18px] w-full flex-col",
                  message.mine ? "items-end pr-0.5" : "items-start pl-0.5",
                ].join(" ")}
              >
                {receiptStatus ? <ChatMessageReceipt status={receiptStatus} /> : null}
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

        <div className="sayittome-chat-composer shrink-0 border-t border-white/5 bg-black/95 px-4 pt-3 backdrop-blur-xl">
          {replyingTo && (
            <div className={`${chatWidthClass} mb-3 rounded-3xl bg-[#090909] px-5 py-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-violet-400">Respondiendo</p>
                  <p className="mt-1 text-lg text-zinc-400">{replyingTo.text}</p>
                </div>

                <button onClick={() => setReplyingTo(null)} className="text-zinc-500">
                  <X size={26} />
                </button>
              </div>
            </div>
          )}

          {audioPreview || imagePreview || videoPreview ? (
            <div className={`${chatWidthClass} mb-4 rounded-[28px] bg-[#070707] p-4`}>
              {audioPreview ? <audio controls src={audioPreview} className="w-full" /> : null}

              {imagePreview ? (
                viewOnce ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[22px] border border-orange-400/30 bg-orange-500/10 text-orange-300">
                    <Bomb size={44} />
                    <p className="mt-3 text-xl font-black">Bomba activada</p>
                    <p className="mt-1 text-sm text-orange-200/70">La imagen no se vera hasta abrirse una vez</p>
                  </div>
                ) : (
                  <img src={imagePreview} className="max-h-[280px] rounded-[22px]" />
                )
              ) : null}

              {videoPreview ? (
                viewOnce ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[22px] border border-orange-400/30 bg-orange-500/10 text-orange-300">
                    <Bomb size={44} />
                    <p className="mt-3 text-xl font-black">Bomba activada</p>
                    <p className="mt-1 text-sm text-orange-200/70">El video no se vera hasta abrirse una vez</p>
                  </div>
                ) : (
                  <video src={videoPreview} controls className="max-h-[280px] rounded-[22px]" />
                )
              ) : null}

              <button
                type="button"
                onClick={() => setViewOnce((v) => !v)}
                className={[
                  "mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition",
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

              {uploadProgress !== null ? (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full bg-violet-500"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              ) : null}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={sendMedia}
                  className="rounded-2xl bg-violet-500/80 px-5 py-3 text-lg font-bold"
                >
                  Enviar
                </button>

                <button
                  onClick={clearPreview}
                  className="rounded-2xl bg-white/[0.07] px-5 py-3 text-lg"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {recording ? (
            <div className={`${chatWidthClass} mb-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-300`}>
              Grabando audio... solta para terminar
            </div>
          ) : null}

          <div className={`${chatWidthClass} flex items-center gap-2`}>
            <input
              ref={cameraPhotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null, "camera")}
            />

            <input
              ref={cameraVideoRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null, "camera")}
            />

            <input
              ref={galleryRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null, "gallery")}
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
              onClick={() => void openGalleryPicker()}
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
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Escribi un mensaje..."
                className="w-full bg-transparent text-base outline-none placeholder:text-white/30"
              />
            </div>

            <button
              type="button"
              onPointerDown={startAudioRecording}
              onPointerUp={stopAudioRecording}
              onPointerCancel={stopAudioRecording}
              className={[
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition",
                recording
                  ? "border-red-400/50 bg-red-500/20 text-red-300"
                  : "border-white/10 bg-white/[0.06] text-white/70",
              ].join(" ")}
              title="Mantener para audio"
            >
              <Mic size={19} />
            </button>

            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              onClick={sendMessage}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/80 text-white"
              title="Enviar"
            >
              {text.trim() ? <Send size={18} /> : <ArrowUp size={18} />}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

