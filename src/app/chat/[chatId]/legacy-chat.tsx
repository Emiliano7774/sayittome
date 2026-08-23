"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUxMode } from "@/contexts/UxModeContext";
import { useT } from "@/contexts/LocaleContext";
import UxModeSwitcher from "@/components/UxModeSwitcher";

import {
  addDoc,
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";
import { uploadChatMessageMedia } from "@/lib/media/upload";
import ChatAudioPlayer from "@/components/chat/ChatAudioPlayer";
import ChatMessageDeleteMenu from "@/components/chat/ChatMessageDeleteMenu";
import ChatMessageLongPress from "@/components/chat/ChatMessageLongPress";
import ChatMessageReceipt from "@/components/chat/ChatMessageReceipt";
import { resolveMessageReceiptStatus } from "@/lib/chat/messageReceipt";
import { CHAT_FILE_INPUT_CLASS, openNativeGalleryFilePicker } from "@/lib/media/chatMediaCapture";
import {
  CHAT_AUDIO_MIN_BYTES,
  classifyChatAudioCaptureFailure,
  pickSupportedAudioMimeType,
  reduceChatAudioEvent,
  type ChatAudioPhase,
} from "@/lib/media/chatAudioCapture";
import {
  ensureChatMicrophonePermission,
  isNativeChatMicrophoneShell,
  noticeFromCaptureFailure,
  noticeFromMicrophonePermission,
  openChatMicrophoneSettings,
  type ChatMicNotice,
} from "@/lib/media/chatMicrophonePermission";
import { preparePlayableChatAudio } from "@/lib/media/chatAudioPlayback";
import {
  DELETED_MESSAGE_PREVIEW,
  deleteOpId,
  isCanonicalDeleteAuthor,
  isHiddenForViewer,
  tombstoneDeletedMessage,
} from "@/lib/chat/messageDelete";
import { viewerHideKeys } from "@/lib/chat/messageDeleteServer";
import { persistMessageDelete } from "@/lib/chat/persistMessageDelete";
import {
  dequeueMessageDelete,
  forgetLocalHiddenMessage,
  queueMessageDelete,
  readLocalHiddenMessageIds,
  rememberLocalHiddenMessage,
} from "@/lib/chat/messageDeleteLocal";
import { scheduleModerationActivityTouch } from "@/lib/moderation/touchModerationActivity";
import { inboxChatFromFirestore, markChatAsRead } from "@/lib/chat/unread";
import {
  buildOutgoingChatMetaPatch,
  resolveChatRecipientIds,
} from "@/lib/chat/outgoingChatMeta";
import { markChatMessagesWhipAlerted } from "@/lib/chat/whipAlertDedupe";
import { useChatViewportLock } from "@/hooks/useChatViewportLock";
import {
  profileAuthUid,
  resolveLegacyChatMessageMine,
} from "@/lib/chat/profileAnonMessageAuthor";
import { buildLegacyCanonicalSender } from "@/lib/chat/canonicalSender";
import { peekCachedViewerIdentity } from "@/lib/chat/viewerIdentityCache";
import {
  readCachedChatMessages,
  writeCachedChatMessages,
  type CachedChatMessage,
} from "@/lib/chat/chatMessageCache";

type MessageStatus = "sending" | "sent" | "error";
type MediaType = "image" | "video" | "audio";

type MessageData = {
  id?: string;
  texto?: string;
  fromUid?: string;
  senderAuthUid?: string;
  senderProfileId?: string;
  senderRole?: string;
  createdAt?: unknown;
  readBy?: Record<string, boolean>;
  clientMessageId?: string;
  optimistic?: boolean;
  status?: MessageStatus;
  uploadProgress?: number;
  replyToMessageId?: string;
  replyToText?: string;
  replyToSender?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  mediaName?: string;
  mediaSize?: number;
  hiddenFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
};

type ChatData = {
  typing?: Record<string, boolean>;
  readBy?: Record<string, boolean>;
  unreadCounts?: Record<string, number>;
  updatedAt?: { toMillis?: () => number };
  participantes?: string[];
  participants?: string[];
  lastMessage?: string;
  lastMessageSender?: string;
  targetUsername?: string;
  receptorUsername?: string;
  receptorUid?: string;
  targetUid?: string;
  initiatorUid?: string;
  anonOwnerUid?: string;
  anon?: boolean;
  senderIsAnonymous?: boolean;
};

function createClientMessageId(uid: string) {
  return [
    "web",
    uid,
    Date.now().toString(),
    Math.random().toString(36).slice(2, 10),
  ].join("_");
}

function shortReplyText(value?: string) {
  const clean = String(value || "").trim();
  if (!clean) return "Mensaje";
  if (clean.length <= 90) return clean;
  return clean.slice(0, 90) + "...";
}

function mediaLabel(type?: MediaType) {
  if (type === "image") return "Imagen";
  if (type === "video") return "Video";
  if (type === "audio") return "Audio";
  return "Multimedia";
}

function createdAtToMs(value: unknown): number | undefined {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as {
    toMillis?: () => unknown;
    toDate?: () => unknown;
    getTime?: () => unknown;
  };
  if (typeof candidate.toMillis === "function") {
    const ms = Number(candidate.toMillis());
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (typeof candidate.toDate === "function") {
    const date = candidate.toDate();
    if (date instanceof Date) {
      const ms = date.getTime();
      return Number.isFinite(ms) ? ms : undefined;
    }
  }
  if (typeof candidate.getTime === "function") {
    const ms = Number(candidate.getTime());
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

function legacyMessageToCached(message: MessageData): CachedChatMessage {
  const createdAtMs = createdAtToMs(message.createdAt);
  return {
    id: String(message.id || message.clientMessageId || ""),
    text: String(message.texto || ""),
    fromUid: message.fromUid,
    senderAuthUid: message.senderAuthUid,
    senderProfileId: message.senderProfileId,
    senderRole: message.senderRole,
    type: message.mediaType,
    mediaUrl: message.mediaUrl,
    readBy: message.readBy,
    hiddenFor: message.hiddenFor,
    deletedForEveryone: message.deletedForEveryone,
    ...(createdAtMs ? { createdAtMs } : {}),
  };
}

function cachedToLegacyMessage(message: CachedChatMessage): MessageData {
  return {
    id: message.id,
    texto: message.text,
    fromUid: message.fromUid,
    senderAuthUid: message.senderAuthUid,
    senderProfileId: message.senderProfileId,
    senderRole: message.senderRole,
    mediaUrl: message.mediaUrl,
    mediaType: message.type === "text" ? undefined : message.type,
    readBy: message.readBy,
    hiddenFor: message.hiddenFor,
    deletedForEveryone: message.deletedForEveryone,
    status: "sent",
    createdAt: message.createdAtMs
      ? { toMillis: () => message.createdAtMs!, toDate: () => new Date(message.createdAtMs!) }
      : undefined,
  };
}

function hydrateLegacyCachedMessages(chatId: string): MessageData[] {
  const cached = readCachedChatMessages(chatId);
  if (!cached?.length) return [];
  return cached
    .filter((row) => row.id)
    .map(cachedToLegacyMessage);
}

export default function LegacyChatPage() {
  const t = useT();
  const { uxMode } = useUxMode();
  const params = useParams();
  const chatId = decodeURIComponent(String(params.chatId || ""));

  const [messages, setMessages] = useState<MessageData[]>(() =>
    chatId ? hydrateLegacyCachedMessages(chatId) : [],
  );
  const [optimisticMessages, setOptimisticMessages] = useState<MessageData[]>([]);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<MessageData | null>(null);
  const [viewer, setViewer] = useState<MessageData | null>(null);
  const [recording, setRecording] = useState(false);
  const [micNotice, setMicNotice] = useState<ChatMicNotice>(null);
  const [currentUid, setCurrentUid] = useState(() => profileAuthUid(auth.currentUser));
  const [firebaseUid, setFirebaseUid] = useState(() => String(auth.currentUser?.uid || ""));
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MessageData | null>(null);
  const [deleteStage, setDeleteStage] = useState<"choose" | "confirm-me" | "confirm-everyone">("choose");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const firstMessagesLoadRef = useRef(true);
  const lastIncomingMessageIdRef = useRef<string | null>(null);
  const chatMetaRef = useRef<ChatData | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioPhaseRef = useRef<ChatAudioPhase>("idle");
  const audioRecordingSessionRef = useRef(0);

  function notifyModerationActivity(
    overrides: Partial<ChatData> & { lastMessage?: string; lastMessageSender?: string },
  ) {
    scheduleModerationActivityTouch({
      id: chatId,
      targetUsername: overrides.targetUsername ?? chat?.targetUsername,
      receptorUsername: overrides.receptorUsername ?? chat?.receptorUsername,
      receptorUid: overrides.receptorUid ?? chat?.receptorUid,
      targetUid: overrides.targetUid ?? chat?.targetUid,
      initiatorUid: overrides.initiatorUid ?? chat?.initiatorUid,
      anonOwnerUid: overrides.anonOwnerUid ?? chat?.anonOwnerUid,
      lastMessage: overrides.lastMessage ?? chat?.lastMessage,
      lastMessageSender: overrides.lastMessageSender ?? chat?.lastMessageSender,
      anon: overrides.anon ?? chat?.anon,
      senderIsAnonymous: overrides.senderIsAnonymous ?? chat?.senderIsAnonymous,
    });
  }

  useEffect(() => {
    let cancelled = false;
    void auth.authStateReady().then(() => {
      if (cancelled) return;
      setCurrentUid(profileAuthUid(auth.currentUser));
      setFirebaseUid(String(auth.currentUser?.uid || ""));
    });

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(profileAuthUid(user));
      setFirebaseUid(String(user?.uid || ""));
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const unsub = onSnapshot(doc(db, "chats", chatId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as ChatData;
      chatMetaRef.current = data;
      setChat(data);

      const user = auth.currentUser;
      if (user) {
        void markChatAsRead(
          chatId,
          user.uid,
          inboxChatFromFirestore(chatId, data as Record<string, unknown>),
          user.uid,
        ).catch(() => undefined);
      }
    });

    return () => {
      const user = auth.currentUser;
      const data = chatMetaRef.current;
      if (user && data) {
        void markChatAsRead(
          chatId,
          user.uid,
          inboxChatFromFirestore(chatId, data as Record<string, unknown>),
          user.uid,
        ).catch(() => undefined);
      }
      unsub();
    };
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
      limitToLast(50),
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const docs: MessageData[] = [];

      snapshot.forEach((docu) => {
        const data = docu.data() as MessageData;
        docs.push({
          id: docu.id,
          status: "sent",
          ...data,
          ...(data.deletedForEveryone
            ? {
                texto: DELETED_MESSAGE_PREVIEW,
                mediaUrl: "",
                mediaType: undefined,
              }
            : {}),
        });
      });

      const user = auth.currentUser;
      const hideKeys = viewerHideKeys({
        authUid: user?.uid || firebaseUid,
        profileUid: profileAuthUid(user) || currentUid,
      });
      const localHidden = new Set(readLocalHiddenMessageIds(chatId));
      const visibleDocs = docs.filter((row) => {
        const id = String(row.id || "");
        if (id && localHidden.has(id)) return false;
        return !isHiddenForViewer(row.hiddenFor, hideKeys);
      });

      if (user && visibleDocs.length > 0) {
        const lastRealMessage = visibleDocs[visibleDocs.length - 1];
        const lastRealMessageId =
          lastRealMessage.id || lastRealMessage.clientMessageId || null;

        if (firstMessagesLoadRef.current) {
          firstMessagesLoadRef.current = false;
          lastIncomingMessageIdRef.current = lastRealMessageId;
        } else if (lastRealMessageId) {
          lastIncomingMessageIdRef.current = lastRealMessageId;
        }
      } else if (firstMessagesLoadRef.current) {
        firstMessagesLoadRef.current = false;
      }

      markChatMessagesWhipAlerted(
        chatId,
        docs.map((message) => message.id || message.clientMessageId || "").filter(Boolean),
      );

      setMessages(visibleDocs);
      writeCachedChatMessages(
        chatId,
        visibleDocs
          .filter((message) => message.id)
          .map(legacyMessageToCached)
          .filter((message) => message.id && (message.text || message.mediaUrl || message.deletedForEveryone)),
      );

      setOptimisticMessages((prev) =>
        prev.filter((localMsg) => {
          if (localMsg.status === "error") return true;

          const existsInFirestore = docs.some(
            (realMsg) =>
              realMsg.clientMessageId &&
              realMsg.clientMessageId === localMsg.clientMessageId
          );

          return !existsInFirestore;
        })
      );

      if (user) {
        snapshot.forEach(async (docu) => {
          const data = docu.data() as MessageData;
          const alreadyRead = data.readBy?.[user.uid];

          if (!alreadyRead && data.fromUid !== user.uid) {
            try {
              await updateDoc(doc(db, "chats", chatId, "mensajes", docu.id), {
                ["readBy." + user.uid]: true,
              });
            } catch (e) {
              console.error(e);
            }
          }
        });

        try {
          await markChatAsRead(
            chatId,
            user.uid,
            inboxChatFromFirestore(
              chatId,
              (chatMetaRef.current || {}) as Record<string, unknown>,
            ),
            user.uid,
          );
          await updateDoc(doc(db, "chats", chatId), {
            ["typing." + user.uid]: false,
          });
        } catch (e) {
          console.error(e);
        }
      }

      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    });

    return () => unsub();
  }, [chatId, firebaseUid, currentUid]);

  const viewerUid =
    currentUid ||
    profileAuthUid(auth.currentUser) ||
    peekCachedViewerIdentity()?.uid ||
    "";
  useChatViewportLock(Boolean(chatId));

  const visibleMessages = useMemo(() => {
    const realClientIds = new Set(
      messages
        .map((msg) => msg.clientMessageId)
        .filter((id): id is string => Boolean(id))
    );

    const pendingMessages = optimisticMessages.filter((msg) => {
      if (!msg.clientMessageId) return true;
      return !realClientIds.has(msg.clientMessageId);
    });

    return [...messages, ...pendingMessages];
  }, [messages, optimisticMessages]);

  const setTyping = async (value: boolean) => {
    const user = auth.currentUser;
    if (!user || !chatId) return;

    try {
      await updateDoc(doc(db, "chats", chatId), {
        ["typing." + user.uid]: value,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);

    const user = auth.currentUser;
    if (!user || !chatId) return;

    setTyping(value.trim().length > 0);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 1500);
  };

  const startReply = (msg: MessageData) => {
    setReplyingTo(msg);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const discardPendingAudio = () => {
    setPendingAudio((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    audioPhaseRef.current = "idle";
  };

  const closeDeleteMenu = () => {
    setDeleteTarget(null);
    setDeleteStage("choose");
  };

  const runMessageDelete = async (mode: "me" | "everyone") => {
    const target = deleteTarget;
    if (!target?.id || !chatId) return;
    const messageId = target.id;
    const previous = messages;
    closeDeleteMenu();
    if (mode === "me") {
      rememberLocalHiddenMessage(chatId, messageId);
      setMessages((old) => old.filter((row) => row.id !== messageId));
    } else {
      const tombstone = tombstoneDeletedMessage();
      setMessages((old) =>
        old.map((row) =>
          row.id === messageId
            ? {
                ...row,
                texto: tombstone.texto,
                mediaUrl: "",
                mediaType: undefined,
                deletedForEveryone: true,
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
        alert("No se pudo eliminar el mensaje. Probá de nuevo.");
      }
    }
  };

  const deleteMenu = (
    <ChatMessageDeleteMenu
      open={Boolean(deleteTarget)}
      canDeleteForEveryone={Boolean(
        deleteTarget &&
          isCanonicalDeleteAuthor(
            {
              fromUid: deleteTarget.fromUid,
              senderAuthUid: deleteTarget.senderAuthUid,
              senderRole: deleteTarget.senderRole,
            },
            { authUid: firebaseUid, profileUid: currentUid, identityReady: true },
          ),
      )}
      stage={deleteStage}
      onChooseMe={() => setDeleteStage("confirm-me")}
      onChooseEveryone={() => setDeleteStage("confirm-everyone")}
      onConfirmMe={() => void runMessageDelete("me")}
      onConfirmEveryone={() => void runMessageDelete("everyone")}
      onClose={closeDeleteMenu}
      labels={{
        forMe: "Eliminar para mí",
        forEveryone: "Eliminar para todos",
        confirmMe: "El mensaje se ocultará solo para vos. La otra persona lo va a seguir viendo.",
        confirmEveryone:
          "El mensaje se reemplazará por “Mensaje eliminado” para todos y se quitarán los adjuntos.",
        confirm: "Eliminar",
        cancel: "Cancelar",
      }}
    />
  );

  const buildReplyPayload = () => {
    return replyingTo
      ? {
          replyToMessageId: replyingTo.id || replyingTo.clientMessageId || "",
          replyToText: shortReplyText(
            replyingTo.texto || mediaLabel(replyingTo.mediaType)
          ),
          replyToSender: replyingTo.fromUid || "",
        }
      : {};
  };

  const uploadMediaMessage = async ({
    blob,
    fileName,
    mediaType,
    localPreviewUrl,
  }: {
    blob: Blob;
    fileName: string;
    contentType?: string;
    mediaType: MediaType;
    localPreviewUrl: string;
  }) => {
    const user = auth.currentUser;
    const sender = buildLegacyCanonicalSender({
      authReady: Boolean(user),
      liveProfileUid: profileAuthUid(user),
    });

    if (!user || !chatId || !sender.ok) return;
    const author = sender.sender;

    const clientMessageId = createClientMessageId(author.senderAuthUid);
    const replyPayload = buildReplyPayload();

    const optimisticMessage: MessageData = {
      id: clientMessageId,
      texto: "",
      fromUid: author.fromUid,
      senderAuthUid: author.senderAuthUid,
      senderProfileId: author.senderProfileId,
      senderRole: author.senderRole,
      createdAt: new Date(),
      clientMessageId,
      optimistic: true,
      status: "sending",
      uploadProgress: 0,
      readBy: { [author.senderAuthUid]: true },
      mediaUrl: localPreviewUrl,
      mediaType,
      mediaName: fileName,
      mediaSize: blob.size,
      ...replyPayload,
    };

    setReplyingTo(null);
    setOptimisticMessages((prev) => [...prev, optimisticMessage]);

    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }, 20);

    try {
      const kind =
        mediaType === "video" ? "video" : mediaType === "audio" ? "audio" : "image";
      const downloadUrl = await uploadChatMessageMedia(
        chatId,
        clientMessageId,
        blob,
        kind,
        (progress) => {
          setOptimisticMessages((prev) =>
            prev.map((msg) =>
              msg.clientMessageId === clientMessageId
                ? { ...msg, uploadProgress: progress }
                : msg
            )
          );
        },
      );

      await addDoc(collection(db, "chats", chatId, "mensajes"), {
        texto: "",
        fromUid: author.fromUid,
        senderAuthUid: author.senderAuthUid,
        senderProfileId: author.senderProfileId,
        senderRole: author.senderRole,
        senderKind: author.senderKind,
        createdByAuthUid: author.senderAuthUid,
        identityReadyAtWrite: true,
        createdAt: serverTimestamp(),
        clientMessageId,
        mediaUrl: downloadUrl,
        mediaType,
        mediaName: fileName,
        mediaSize: blob.size,
        readBy: { [author.senderAuthUid]: true },
        ...replyPayload,
      });

      await updateDoc(
        doc(db, "chats", chatId),
        buildOutgoingChatMetaPatch(
          author.fromUid,
          resolveChatRecipientIds(author.senderAuthUid, chat),
          {
            lastMessage: mediaLabel(mediaType),
            lastMessageSender: author.fromUid,
          },
        ),
      );

      notifyModerationActivity({
        lastMessage: mediaLabel(mediaType),
        lastMessageSender: author.fromUid,
      });

      URL.revokeObjectURL(localPreviewUrl);
    } catch (e) {
      console.error(e);

      setOptimisticMessages((prev) =>
        prev.map((msg) =>
          msg.clientMessageId === clientMessageId
            ? { ...msg, status: "error" }
            : msg
        )
      );

      alert("No se pudo enviar el archivo.");
    }
  };

  const sendPendingAudio = async () => {
    if (!pendingAudio) return;
    const { blob, url } = pendingAudio;
    setPendingAudio(null);
    audioPhaseRef.current = "idle";
    const ext = blob.type.includes("wav")
      ? "wav"
      : blob.type.includes("mp3")
        ? "mp3"
        : blob.type.includes("mp4") || blob.type.includes("aac")
          ? "m4a"
          : "webm";
    await uploadMediaMessage({
      blob,
      fileName: "audio_" + Date.now() + "." + ext,
      contentType: blob.type || "audio/webm",
      mediaType: "audio",
      localPreviewUrl: url,
    });
  };

  const audioPreviewCard = pendingAudio ? (
    <div className="mb-3 rounded-[1.5rem] border border-white/10 bg-black px-4 py-3">
      <ChatAudioPlayer src={pendingAudio.url} failLabel="No se pudo reproducir el audio." />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void sendPendingAudio()}
          className="rounded-full bg-white px-4 py-2 text-xs font-black text-black"
        >
          Enviar
        </button>
        <button
          type="button"
          onClick={discardPendingAudio}
          className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white"
        >
          Descartar
        </button>
      </div>
    </div>
  ) : null;

  const sendMessage = async () => {
    const user = auth.currentUser;
    const sender = buildLegacyCanonicalSender({
      authReady: Boolean(user),
      liveProfileUid: profileAuthUid(user),
    });
    if (!user || !text.trim() || !chatId || !sender.ok) return;
    const author = sender.sender;

    const clean = text.trim();
    const clientMessageId = createClientMessageId(author.senderAuthUid);
    const replyPayload = buildReplyPayload();

    const optimisticMessage: MessageData = {
      id: clientMessageId,
      texto: clean,
      fromUid: author.fromUid,
      senderAuthUid: author.senderAuthUid,
      senderProfileId: author.senderProfileId,
      senderRole: author.senderRole,
      createdAt: new Date(),
      clientMessageId,
      optimistic: true,
      status: "sending",
      readBy: { [author.senderAuthUid]: true },
      ...replyPayload,
    };

    setText("");
    setReplyingTo(null);
    setOptimisticMessages((prev) => [...prev, optimisticMessage]);

    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }, 20);

    try {
      await addDoc(collection(db, "chats", chatId, "mensajes"), {
        texto: clean,
        fromUid: author.fromUid,
        senderAuthUid: author.senderAuthUid,
        senderProfileId: author.senderProfileId,
        senderRole: author.senderRole,
        senderKind: author.senderKind,
        createdByAuthUid: author.senderAuthUid,
        identityReadyAtWrite: true,
        createdAt: serverTimestamp(),
        clientMessageId,
        readBy: { [author.senderAuthUid]: true },
        ...replyPayload,
      });

      await updateDoc(
        doc(db, "chats", chatId),
        buildOutgoingChatMetaPatch(
          author.fromUid,
          resolveChatRecipientIds(author.senderAuthUid, chat),
          {
            lastMessage: clean,
            lastMessageSender: author.fromUid,
          },
        ),
      );

      notifyModerationActivity({
        lastMessage: clean,
        lastMessageSender: author.fromUid,
      });
    } catch (e) {
      console.error(e);

      setOptimisticMessages((prev) =>
        prev.map((msg) =>
          msg.clientMessageId === clientMessageId
            ? { ...msg, status: "error" }
            : msg
        )
      );

      alert("No se pudo enviar.");
    }
  };

  const handlePickMedia = () => {
    const opened = openNativeGalleryFilePicker(fileInputRef.current);
    if (!opened) {
      alert("No se pudo abrir la galería. Revisá los permisos del navegador o la app.");
    }
  };

  const handleMediaSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      alert("Solo pod├⌐s enviar im├ígenes o videos.");
      return;
    }

    const maxSize = isVideo ? 80 * 1024 * 1024 : 15 * 1024 * 1024;

    if (file.size > maxSize) {
      alert(isVideo ? "El video es demasiado pesado." : "La imagen es demasiado pesada.");
      return;
    }

    await uploadMediaMessage({
      blob: file,
      fileName: file.name,
      contentType: file.type,
      mediaType: isImage ? "image" : "video",
      localPreviewUrl: URL.createObjectURL(file),
    });
  };

  const startRecording = async () => {
    const decision = reduceChatAudioEvent(audioPhaseRef.current, { type: "tap" });
    audioPhaseRef.current = decision.phase;
    if (decision.stopCapture) {
      stopRecording();
      return;
    }
    if (!decision.startCapture) return;

    const session = audioRecordingSessionRef.current + 1;
    audioRecordingSessionRef.current = session;
    setRecording(true);
    setMicNotice(null);

    let permissionState: "prompt" | "granted" | "denied" | "blocked" | "unavailable" = "prompt";
    try {
      const permission = await ensureChatMicrophonePermission();
      permissionState = permission.state;
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
        setMicNotice(noticeFromMicrophonePermission(permission));
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== audioRecordingSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        audioPhaseRef.current = "idle";
        return;
      }

      audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
        type: "stream-ready",
      }).phase;

      recordingStreamRef.current = stream;
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

      recorder.onstop = async () => {
        if (session !== audioRecordingSessionRef.current) {
          recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
          mediaRecorderRef.current = null;
          audioChunksRef.current = [];
          setRecording(false);
          audioPhaseRef.current = "idle";
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });

        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setRecording(false);

        if (audioBlob.size < CHAT_AUDIO_MIN_BYTES) {
          audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
            type: "blob-too-small",
          }).phase;
          setMicNotice("failed");
          return;
        }

        audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
          type: "blob-ready",
        }).phase;

        let playable = audioBlob;
        try {
          const prepared = await preparePlayableChatAudio(audioBlob);
          playable = prepared.blob;
        } catch {
          // keep original blob for preview attempt
        }

        if (session !== audioRecordingSessionRef.current) return;

        setPendingAudio((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return {
            blob: playable,
            url: URL.createObjectURL(playable),
          };
        });
      };

      recorder.start(250);
    } catch (e) {
      if (session !== audioRecordingSessionRef.current) return;
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      setRecording(false);
      const classified = classifyChatAudioCaptureFailure(e, {
        nativeDenied: false,
        nativePlatform: isNativeChatMicrophoneShell(),
      });
      audioPhaseRef.current = reduceChatAudioEvent(audioPhaseRef.current, {
        type: classified === "denied" ? "permission-denied" : "error",
      }).phase;
      setMicNotice(noticeFromCaptureFailure({ classified, permissionState }));
    }
  };

  const stopRecording = () => {
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
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        setRecording(false);
        audioPhaseRef.current = "idle";
      }
      return;
    }

    try {
      if (typeof recorder.requestData === "function") {
        recorder.requestData();
      }
      recorder.stop();
    } catch (e) {
      console.error(e);
      setRecording(false);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      audioPhaseRef.current = "idle";
    }
  };

  const otherTyping = useMemo(() => {
    return Object.entries(chat?.typing || {}).some(
      ([typingUid, value]) => typingUid !== currentUid && value
    );
  }, [chat, currentUid]);

  
if (uxMode === "classic") {
    return (
      <main className="sayittome-chat-shell flex flex-col bg-[#050505] text-white">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4">
            <Link
              href="/chats"
              className="shrink-0 rounded-full border border-white/10 bg-[#111111] px-4 py-2 text-xs font-black"
            >
              Volver
            </Link>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.35em] text-violet-300">
                SAYITTOME
              </p>

              <h1 className="truncate text-lg font-black">
                Chat an├│nimo
              </h1>
            </div>

            <UxModeSwitcher className="ml-auto shrink-0" />
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-40 pt-5">
          <div className="space-y-3">
            {visibleMessages.map((message: MessageData) => {
              const isMine = resolveLegacyChatMessageMine(
                String(message.fromUid || ""),
                viewerUid,
                String(message.senderAuthUid || ""),
              );
              const receiptStatus = resolveMessageReceiptStatus({
                mine: isMine,
                readBy: message.readBy,
                senderId: viewerUid,
              });

              return (
                <div
                  key={message.id}
                  className={[
                    "flex flex-col",
                    isMine ? "items-end" : "items-start",
                  ].join(" ")}
                >
                  <ChatMessageLongPress
                    onLongPress={() => {
                      setDeleteTarget(message);
                      setDeleteStage("choose");
                    }}
                  >
                  <div
                    className={
                      isMine
                        ? "max-w-[82%] rounded-lg rounded-br-sm bg-violet-600 px-4 py-2.5 text-sm leading-snug text-white shadow-[0_0_18px_rgba(139,92,246,0.22)]"
                        : "max-w-[82%] rounded-lg rounded-bl-sm border border-white/10 bg-[#111111] px-4 py-2.5 text-sm leading-snug text-zinc-200"
                    }
                  >
                    {message.deletedForEveryone ? (
                      DELETED_MESSAGE_PREVIEW
                    ) : message.mediaType === "audio" && message.mediaUrl ? (
                      <ChatAudioPlayer
                        src={message.mediaUrl}
                        failLabel="No se pudo reproducir el audio."
                      />
                    ) : (
                      message.texto || "Mensaje"
                    )}
                  </div>
                  </ChatMessageLongPress>

                  {receiptStatus ? <ChatMessageReceipt status={receiptStatus} /> : null}
                </div>
              );
            })}
          </div>
        </section>

        <div className="sayittome-fixed-bottom fixed left-0 right-0 border-t border-white/10 bg-black/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-4 py-4">
            {audioPreviewCard}
            <div className="flex items-center gap-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escrib├¡ un mensaje..."
              className="flex-1 rounded-full border border-white/10 bg-[#111111] px-5 py-4 text-sm outline-none focus:border-violet-500"
            />

            <button
              onClick={sendMessage}
              className="rounded-full bg-violet-600 px-6 py-4 text-sm font-black text-white shadow-[0_0_24px_rgba(139,92,246,0.28)]"
            >
              Enviar
            </button>
            </div>
          </div>
        </div>
        {deleteMenu}
      </main>
    );
  }

  return (
    <main className="sayittome-chat-shell flex flex-col bg-black text-white">
      <div className="border-b border-white/10 bg-zinc-950 px-5 py-4">
        <h1 className="text-lg font-black">Chat an├│nimo</h1>

        {otherTyping && (
          <p className="mt-1 text-xs font-bold text-fuchsia-300">
            escribiendo...
          </p>
        )}
      </div>

      <div className="sayittome-chat-thread-scroller min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {visibleMessages.map((msg) => {
            const mine = resolveLegacyChatMessageMine(
              String(msg.fromUid || ""),
              viewerUid,
              String(msg.senderAuthUid || ""),
            );
            const isSending = msg.status === "sending";
            const hasError = msg.status === "error";
            const receiptStatus = resolveMessageReceiptStatus({
              mine,
              readBy: msg.readBy,
              senderId: currentUid,
              isSending,
              hasError,
            });

            const isReplyingSelected =
              replyingTo &&
              (replyingTo.id || replyingTo.clientMessageId) ===
                (msg.id || msg.clientMessageId);

            const hasMedia = Boolean(msg.mediaUrl && msg.mediaType);

            return (
              <div
                key={msg.id || msg.clientMessageId}
                className={mine ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}
              >
                <ChatMessageLongPress
                  onLongPress={() => {
                    setDeleteTarget(msg);
                    setDeleteStage("choose");
                  }}
                >
                <button
                  type="button"
                  onClick={() => {
                    if (msg.deletedForEveryone) return;
                    startReply(msg);
                  }}
                  title="Responder"
                  className={
                    mine
                      ? isReplyingSelected
                        ? "w-full rounded-[22px] rounded-br-md border border-white/30 bg-fuchsia-600/80 px-4 py-2.5 text-left text-[15px] font-medium leading-snug text-white shadow-[0_0_30px_rgba(217,70,239,0.25)]"
                        : isSending
                          ? "w-full rounded-[22px] rounded-br-md bg-fuchsia-600/60 px-4 py-2.5 text-left text-[15px] font-medium leading-snug text-white"
                          : hasError
                            ? "w-full rounded-[22px] rounded-br-md bg-red-600 px-4 py-2.5 text-left text-[15px] font-medium leading-snug text-white"
                            : "w-full rounded-[22px] rounded-br-md bg-fuchsia-600 px-4 py-2.5 text-left text-[15px] font-medium leading-snug text-white"
                        : isReplyingSelected
                        ? "w-full rounded-[22px] rounded-bl-md border border-fuchsia-400/50 bg-zinc-800 px-4 py-2.5 text-left text-[15px] font-medium leading-snug text-white shadow-[0_0_30px_rgba(217,70,239,0.18)]"
                        : "w-full rounded-[22px] rounded-bl-md bg-zinc-900 px-4 py-2.5 text-left text-[15px] font-medium leading-snug text-white"
                  }
                >
                  {msg.replyToText && (
                    <div
                      className={
                        mine
                          ? "mb-3 rounded-2xl border-l-4 border-white/70 bg-black/20 px-4 py-3 text-xs text-white/80"
                          : "mb-3 rounded-2xl border-l-4 border-fuchsia-400 bg-black/30 px-4 py-3 text-xs text-zinc-300"
                      }
                    >
                      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200">
                        Respuesta
                      </p>

                      <p className="line-clamp-2">{msg.replyToText}</p>
                    </div>
                  )}

                  {hasMedia && msg.mediaType !== "audio" && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewer(msg);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          setViewer(msg);
                        }
                      }}
                      className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/30"
                    >
                      {msg.mediaType === "image" ? (
                        <img
                          src={msg.mediaUrl}
                          alt={msg.mediaName || "Imagen enviada"}
                          className="max-h-[360px] w-full object-cover"
                        />
                      ) : (
                        <video
                          src={msg.mediaUrl}
                          className="max-h-[360px] w-full object-cover"
                          muted
                          playsInline
                        />
                      )}

                      {isSending && (
                        <div className="px-4 py-3 text-xs font-black text-white/80">
                          Subiendo... {msg.uploadProgress || 0}%
                        </div>
                      )}
                    </div>
                  )}

                  {hasMedia && msg.mediaType === "audio" && !msg.deletedForEveryone && (
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200">
                        Audio
                      </p>
                      <ChatAudioPlayer
                        src={msg.mediaUrl || ""}
                        failLabel="No se pudo reproducir el audio."
                      />
                    </div>
                  )}

                  {msg.deletedForEveryone ? (
                    <p>{DELETED_MESSAGE_PREVIEW}</p>
                  ) : msg.texto ? (
                    <p className={hasMedia ? "mt-3" : ""}>{msg.texto}</p>
                  ) : null}

                  {!msg.texto && !hasMedia && !msg.deletedForEveryone && (
                    <p className="text-white/70">Mensaje</p>
                  )}
                </button>
                </ChatMessageLongPress>

                {receiptStatus ? <ChatMessageReceipt status={receiptStatus} /> : null}

                {!mine && (
                  <p className="mt-1 text-left text-[10px] font-bold text-zinc-700">
                    Toc├í el mensaje para responder
                  </p>
                )}
              </div>
            );
          })}

          {otherTyping && (
            <div className="mr-auto max-w-[80%] rounded-[2rem] rounded-bl-md bg-zinc-900 px-5 py-4 text-sm font-bold text-zinc-400">
              escribiendo...
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-white/10 bg-zinc-950 p-4">
        <div className="mx-auto max-w-3xl">
          {audioPreviewCard}
          {replyingTo && (
            <div className="mb-3 rounded-[1.5rem] border border-fuchsia-500/30 bg-black px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-fuchsia-300">
                    Respondiendo
                  </p>

                  <p className="mt-1 truncate text-sm font-bold text-white">
                    {shortReplyText(replyingTo.texto || mediaLabel(replyingTo.mediaType))}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={cancelReply}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-zinc-300 hover:border-fuchsia-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className={CHAT_FILE_INPUT_CLASS}
            onChange={handleMediaSelected}
          />

          {micNotice ? (
            <div className="mb-3 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-center text-sm text-white/80">
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
                  className="mt-2 text-sm font-bold text-fuchsia-300"
                  onClick={() => openChatMicrophoneSettings()}
                >
                  {t("chat_mic_open_settings")}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePickMedia}
              className="rounded-full border border-white/10 bg-black px-5 py-4 text-sm font-black text-white transition hover:border-fuchsia-400"
            >
              +
            </button>

            <input
              ref={inputRef}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={recording ? "Grabando audio..." : replyingTo ? "Responder mensaje..." : "Mensaje an├│nimo..."}
              disabled={recording}
              className="flex-1 rounded-full border border-white/10 bg-black px-6 py-4 text-sm outline-none focus:border-fuchsia-500 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
                if (e.key === "Escape" && replyingTo) cancelReply();
              }}
            />

            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                if (recording && audioPhaseRef.current !== "arming") {
                  stopRecording();
                  return;
                }
                void startRecording();
              }}
              className={
                recording
                  ? "rounded-full bg-red-500 px-5 py-4 text-sm font-black text-white transition hover:scale-[1.02]"
                  : "rounded-full border border-white/10 bg-black px-5 py-4 text-sm font-black text-white transition hover:border-fuchsia-400"
              }
            >
              {recording ? "Stop" : "Audio"}
            </button>

            <button
              onClick={sendMessage}
              disabled={recording}
              className="rounded-full bg-white px-6 py-4 text-sm font-black text-black transition hover:scale-[1.02] disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      {viewer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setViewer(null)}
        >
          <button
            type="button"
            onClick={() => setViewer(null)}
            className="absolute right-5 top-5 rounded-full bg-white px-5 py-3 text-sm font-black text-black"
          >
            Cerrar
          </button>

          <div
            className="max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            {viewer.mediaType === "image" ? (
              <img
                src={viewer.mediaUrl}
                alt={viewer.mediaName || "Imagen"}
                className="max-h-[90vh] max-w-full rounded-[2rem] object-contain"
              />
            ) : (
              <video
                src={viewer.mediaUrl}
                controls
                autoPlay
                className="max-h-[90vh] max-w-full rounded-[2rem]"
              />
            )}
          </div>
        </div>
      )}
      {deleteMenu}
    </main>
  );
}
