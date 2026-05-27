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
import { useEffect, useRef, useState } from "react";

import AudioWave from "@/components/chat/media/AudioWave";
import FullscreenMedia from "@/components/chat/media/FullscreenMedia";
import { uploadMedia } from "@/lib/media/upload";
import { canOpenViewOnce, markOpened } from "@/lib/media/viewOnce";
import AbuseProtectionMenu from "@/components/chat/AbuseProtectionMenu";
import ChatMessageReceipt from "@/components/chat/ChatMessageReceipt";
import ClassicAnonPresenceBubble from "@/components/chat/ClassicAnonPresenceBubble";
import StoryAvatarButton from "@/components/stories/StoryAvatarButton";
import { useUxMode } from "@/contexts/UxModeContext";
import { findActiveAbuseBlock } from "@/lib/abuse/anonAbuseBlocks";
import { getVisitorId } from "@/lib/abuse/fingerprint";
import { getProfileChatAnonSenderId } from "@/lib/chat/anonSender";
import { getAnonSessionId } from "@/lib/chat/anonSession";
import { buildLegacyProfileChatIds } from "@/lib/chat/anonChatId";
import { deleteEmptyChatIfIdle, migrateToCanonicalChat } from "@/lib/chat/migrate";
import { resolveMessageReceiptStatus } from "@/lib/chat/messageReceipt";
import { registerSessionChat, unregisterSessionChat } from "@/lib/chat/sessionChats";
import { scheduleModerationActivityTouch } from "@/lib/moderation/touchModerationActivity";
import { resolveProfilePhoto } from "@/lib/profile/resolveProfilePhoto";
import { useFormatLastSeen } from "@/hooks/useLocaleFormatters";
import { useIncomingMessageWhip } from "@/hooks/useIncomingMessageWhip";
import { useT } from "@/contexts/LocaleContext";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";


type Message = {
  id: string;
  text: string;
  mine: boolean;
  reply?: string;
  type?: "text" | "audio" | "image" | "video";
  mediaUrl?: string;
  source?: "camera" | "gallery" | "audio";
  viewOnce?: boolean;
  readBy?: Record<string, boolean>;
};

export default function ProfileAnonChat({
  chatId,
  username,
}: {
  chatId: string;
  username: string;
}) {

  const t = useT();
  const { uxMode } = useUxMode();
  const formatLastSeen = useFormatLastSeen();
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [blockedByAbuse, setBlockedByAbuse] = useState(false);
  const [chatAnonSessionId, setChatAnonSessionId] = useState("");
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

  useEffect(() => {
    setAnonSession(getAnonSessionId());
    inputRef.current?.focus();
    document.body.classList.add("sayittome-chat-open");

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || "");
      setAuthReady(true);
    });

    return () => {
      unsub();
      document.body.classList.remove("sayittome-chat-open");
    };
  }, []);

  useEffect(() => {
    messagePersistedRef.current = false;

    return () => {
      if (messagePersistedRef.current) return;

      void deleteEmptyChatIfIdle(chatId).finally(() => {
        unregisterSessionChat(chatId);
      });
    };
  }, [chatId]);

  useEffect(() => {
    if (!targetUid || !authReady) return;

    const senderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    const visitorId = getVisitorId();

    findActiveAbuseBlock({
      receptorUid: targetUid,
      blockedAnonId: senderId,
      blockedVisitorId: visitorId,
    })
      .then((block) => setBlockedByAbuse(Boolean(block)))
      .catch(() => setBlockedByAbuse(false));
  }, [targetUid, authReady, anonSession, chatId, chatAnonSessionId]);

  useEffect(() => {
    if (!chatId) return;

    const unsub = onSnapshot(doc(db, "chats", chatId), (snap) => {
      const data = snap.data() as { anonSessionId?: string } | undefined;
      setChatAnonSessionId(String(data?.anonSessionId || ""));
    });

    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTargetProfile() {
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

    loadTargetProfile();

    return () => {
      cancelled = true;
    };
  }, [username, chatId]);

  const presenceLabel = formatLastSeen(targetLastActive, targetOnline);
  const isClassic = uxMode === "classic";
  const isOwnerViewing = Boolean(currentUid && targetUid && currentUid === targetUid);
  const anonSenderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
  const classicChatEngaged =
    isClassic &&
    (isOwnerViewing
      ? messages.some((message) => message.mine)
      : messages.some((message) => message.mine) || messages.length > 0);
  const showClassicIntro = isClassic && !classicChatEngaged;
  const chatWidthClass = isClassic ? "w-full" : "mx-auto max-w-5xl";
  const avatarProps = {
    ownerUid: targetUid,
    username,
    photo: targetPhoto,
    mode: "navigate" as const,
    preferProfile: true,
    blurPhoto: targetBlurPhoto,
  };

  useEffect(() => {
    if (!chatId || !authReady) return;

    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("createdAt", "asc"),
    );

    const senderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    const viewerId =
      currentUid && targetUid && currentUid === targetUid ? currentUid : senderId;

    return onSnapshot(
      q,
      (snapshot) => {
        const loaded: Message[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as {
            texto?: string;
            text?: string;
            fromUid?: string;
            ownerId?: string;
            senderUid?: string;
            mine?: boolean;
            reply?: string;
            readBy?: Record<string, boolean>;
            type?: Message["type"];
            mediaUrl?: string;
            source?: Message["source"];
            viewOnce?: boolean;
          };

          const from = String(
            data.fromUid || data.ownerId || data.senderUid || "",
          );
          const mine = isOwnerViewing
            ? from === currentUid
            : from === senderId || data.mine === true;

          return {
            id: docSnap.id,
            text: String(data.texto || data.text || ""),
            mine,
            reply: data.reply,
            type: data.type,
            mediaUrl: data.mediaUrl,
            source: data.source,
            viewOnce: data.viewOnce,
            readBy: data.readBy || {},
          };
        });

        setMessages(loaded);

        if (!viewerId) return;

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as { fromUid?: string; readBy?: Record<string, boolean> };
          if (String(data.fromUid || "") === viewerId) return;
          if (data.readBy?.[viewerId]) return;

          updateDoc(doc(db, "chats", chatId, "mensajes", docSnap.id), {
            [`readBy.${viewerId}`]: true,
          }).catch(() => {});
        });

        if (snapshot.docs.length === 0) return;

        updateDoc(doc(db, "chats", chatId), {
          [`readBy.${viewerId}`]: true,
        }).catch(() => {});
      },
      (error) => {
        console.error(error);
      },
    );
  }, [chatId, authReady, anonSession, currentUid, targetUid, chatAnonSessionId, isOwnerViewing]);

  useIncomingMessageWhip(messages, anonSenderId);

  async function openRealCamera(mode: "photo" | "video") {
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

  async function startAudioRecording() {
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
    if (!pendingBlob || !pendingType) return;

    const url = await uploadMedia(
      `chat_media/${Date.now()}`,
      pendingBlob,
      (pct) => setUploadProgress(pct),
    );

    setMessages((old) => [
      ...old,
      {
        id: crypto.randomUUID(),
        text: "",
        mine: true,
        type: pendingType,
        mediaUrl: url,
        source: pendingSource,
        viewOnce,
      },
    ]);

    clearPreview();
  }

  async function sendMessage() {
    if (!text.trim()) return;
    if (!authReady || !chatId) return;
    if (blockedByAbuse) {
      alert(t("chat_abuse_write_block"));
      return;
    }

    const senderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
    if (targetUid) {
      const block = await findActiveAbuseBlock({
        receptorUid: targetUid,
        blockedAnonId: senderId,
        blockedVisitorId: getVisitorId(),
      });
      if (block) {
        setBlockedByAbuse(true);
        alert(t("chat_abuse_write_block"));
        return;
      }
    }

    const messageText = text.trim();
    const localMessage = {
      id: crypto.randomUUID(),
      text: messageText,
      mine: true,
      reply: replyingTo?.text,
    };

    setMessages((old) => [...old, localMessage]);
    setText("");
    setReplyingTo(null);

    try {
      const participantes = Array.from(
        new Set([
          senderId,
          ...(currentUid ? [currentUid] : []),
          ...(targetUid ? [targetUid] : []),
        ].filter(Boolean)),
      );

      const legacyIds = [
        ...buildLegacyProfileChatIds(senderId, username, targetUid),
        ...(currentUid
          ? buildLegacyProfileChatIds(currentUid, username, targetUid)
          : []),
      ];

      const chatMeta = {
        id: chatId,
        targetUsername: username,
        receptorUsername: username,
        receptorUid: targetUid || null,
        targetUid: targetUid || null,
        initiatorUid: currentUid || null,
        anonOwnerUid: currentUid || null,
        anonSessionId: senderId,
        participantes,
        anon: true,
        senderIsAnonymous: true,
        canonicalChatId: chatId,
        schemaVersion: 2,
        targetPhoto: targetPhoto || null,
        lastMessage: messageText,
        lastMessageSender: senderId,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        readBy: {
          [senderId]: true,
        },
        typing: {
          [senderId]: false,
        },
      };

      await migrateToCanonicalChat(chatId, legacyIds, chatMeta);

      registerSessionChat(chatId);
      messagePersistedRef.current = true;

      await addDoc(collection(db, "chats", chatId, "mensajes"), {
        texto: messageText,
        text: messageText,
        createdAt: serverTimestamp(),
        fromUid: senderId,
        ownerId: senderId,
        mine: true,
        readBy: {
          [senderId]: true,
        },
      });

      await setDoc(
        doc(db, "chats", chatId),
        {
          lastMessage: messageText,
          lastMessageSender: senderId,
          updatedAt: serverTimestamp(),
          [`readBy.${senderId}`]: true,
          [`typing.${senderId}`]: false,
        },
        { merge: true },
      );

      scheduleModerationActivityTouch({
        id: chatId,
        targetUsername: username,
        receptorUsername: username,
        receptorUid: targetUid || undefined,
        targetUid: targetUid || undefined,
        initiatorUid: currentUid || undefined,
        anonOwnerUid: currentUid || undefined,
        anonSessionId: senderId,
        lastMessage: messageText,
        lastMessageSender: senderId,
        anon: true,
        senderIsAnonymous: true,
      });
    } catch (e) {
      console.error(e);
      alert(t("chat_save_fail"));
    }

    setTimeout(() => inputRef.current?.focus(), 10);
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
    <main id="sayittome-chat-page-root" className="min-h-screen overflow-hidden bg-black text-white">
      {fullscreenUrl ? (
        <FullscreenMedia url={fullscreenUrl} onClose={() => setFullscreenUrl("")} />
      ) : null}

      <section className="flex min-h-screen flex-col bg-black">
        <header className="flex items-center gap-4 bg-black px-5 py-4">
          <Link href="/chats" className="text-4xl leading-none text-white/70">
            ‹
          </Link>

          <StoryAvatarButton
            {...avatarProps}
            size="sm"
            iconSize={26}
            className="!shrink-0"
          />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-[-0.03em]">{username}</h1>
            {!isClassic ? (
              <p className="text-lg text-lime-400">{presenceLabel}</p>
            ) : null}
            {blockedByAbuse ? (
              <p className="text-sm font-black text-red-300">{t("chat_abuse_block_active")}</p>
            ) : null}
          </div>

          {currentUid && currentUid === targetUid ? (
            <AbuseProtectionMenu
              receptorUid={targetUid}
              targetUsername={username}
              chatId={chatId}
              blockedAnonId={chatAnonSessionId || anonSession}
              blockedBy={currentUid}
            />
          ) : null}
        </header>

        {showClassicIntro ? (
          <div className="flex flex-col items-center justify-center px-6 pb-2 pt-[min(12vh,5rem)]">
            <StoryAvatarButton
              {...avatarProps}
              size="xl"
              iconSize={88}
              className="!scale-100"
            />
            <ClassicAnonPresenceBubble session={anonSenderId || anonSession} />
          </div>
        ) : isClassic ? (
          <p className="border-b border-white/[0.06] px-5 py-2.5 text-center text-xs font-medium text-white/35">
            {t("chat_anon_you_are", { session: anonSenderId || anonSession })}
          </p>
        ) : (
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
                {t("chat_anon_you_are", { session: anonSession })}
              </p>
            </div>
          </div>
        )}

        <div
          className={[
            "min-h-0 flex-1 pb-36",
            isClassic ? "overflow-y-auto px-3 sm:px-4" : "px-5",
            classicChatEngaged ? "pt-3" : "",
          ].join(" ")}
        >
          <div className={chatWidthClass}>
            {messages.map((message) => {
              const senderId = getProfileChatAnonSenderId(chatId, chatAnonSessionId);
              const receiptStatus = resolveMessageReceiptStatus({
                mine: message.mine,
                readBy: message.readBy,
                senderId,
              });

              return (
              <div
                key={message.id}
                className={[
                  "mb-4 flex w-full flex-col",
                  message.mine ? "items-end pr-0.5" : "items-start pl-0.5",
                ].join(" ")}
              >
                <div
                  onDoubleClick={() => setReplyingTo(message)}
                  className={[
                    isClassic
                      ? "max-w-[min(82vw,22rem)] rounded-[22px] px-4 py-3"
                      : "max-w-[75%] rounded-[30px] px-5 py-4",
                    message.mine
                      ? "bg-violet-500/80 text-white"
                      : "bg-[#0c0c0d] text-white",
                  ].join(" ")}
                >
                  {message.reply && (
                    <div className="mb-3 rounded-2xl bg-black/30 px-4 py-3 text-xl text-zinc-300">
                      {message.reply}
                    </div>
                  )}

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
                  ) : message.type === "video" ? (
                    <video
                      src={message.mediaUrl || ""}
                      controls
                      className="max-h-[420px] rounded-[24px]"
                    />
                  ) : (
                    <p className={isClassic ? "text-base leading-relaxed" : "text-2xl leading-relaxed"}>
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

                {receiptStatus ? <ChatMessageReceipt status={receiptStatus} /> : null}
              </div>
            );
            })}
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

        <div className="sticky bottom-0 border-t border-white/5 bg-black/95 px-4 pb-4 pt-3 backdrop-blur-xl">
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
              onClick={() => galleryRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80"
              title="Galeria"
            >
              <ImageIcon size={19} />
            </button>

            <div className="flex h-11 flex-1 items-center rounded-2xl border border-white/5 bg-[#090909] px-4">
              <input
                ref={inputRef}
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

