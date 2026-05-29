"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUxMode } from "@/contexts/UxModeContext";
import UxModeSwitcher from "@/components/UxModeSwitcher";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db, storage } from "@/lib/firebase";
import ChatMessageReceipt from "@/components/chat/ChatMessageReceipt";
import { resolveMessageReceiptStatus } from "@/lib/chat/messageReceipt";
import { scheduleModerationActivityTouch } from "@/lib/moderation/touchModerationActivity";
import { markChatAsRead } from "@/lib/chat/unread";
import { bindWhipSoundUnlock } from "@/lib/chat/whipSound";
import { markChatMessagesWhipAlerted } from "@/lib/chat/whipAlertDedupe";

type MessageStatus = "sending" | "sent" | "error";
type MediaType = "image" | "video" | "audio";

type MessageData = {
  id?: string;
  texto?: string;
  fromUid?: string;
  createdAt?: any;
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
};

type ChatData = {
  typing?: Record<string, boolean>;
  readBy?: Record<string, boolean>;
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

export default function LegacyChatPage() {
  const { uxMode } = useUxMode();
  const params = useParams();
  const chatId = String(params.chatId || "");

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<MessageData[]>([]);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<MessageData | null>(null);
  const [viewer, setViewer] = useState<MessageData | null>(null);
  const [recording, setRecording] = useState(false);
  const [currentUid, setCurrentUid] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const firstMessagesLoadRef = useRef(true);
  const lastIncomingMessageIdRef = useRef<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  function notifyModerationActivity(
    overrides: Partial<ChatData> & { lastMessage?: string; lastMessageSender?: string },
  ) {
    scheduleModerationActivityTouch({
      id: chatId,
      targetUsername: overrides.targetUsername ?? chat?.targetUsername,
      receptorUsername: overrides.receptorUsername ?? chat?.receptorUsername,
      receptorUid: overrides.receptorUid ?? chat?.receptorUid,
      targetUid: overrides.targetUid ?? chat?.targetUid,
      initiatorUid: overrides.initiatorUid ?? chat?.initiatorUid ?? currentUid,
      anonOwnerUid: overrides.anonOwnerUid ?? chat?.anonOwnerUid ?? currentUid,
      lastMessage: overrides.lastMessage ?? chat?.lastMessage,
      lastMessageSender: overrides.lastMessageSender ?? chat?.lastMessageSender,
      anon: overrides.anon ?? chat?.anon,
      senderIsAnonymous: overrides.senderIsAnonymous ?? chat?.senderIsAnonymous,
    });
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || "");
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const unsub = onSnapshot(doc(db, "chats", chatId), (snapshot) => {
      if (!snapshot.exists()) return;
      setChat(snapshot.data() as ChatData);
    });

    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      const docs: MessageData[] = [];

      snapshot.forEach((docu) => {
        docs.push({
          id: docu.id,
          status: "sent",
          ...(docu.data() as any),
        });
      });

      const user = auth.currentUser;

      if (user && docs.length > 0) {
        const lastRealMessage = docs[docs.length - 1];
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

      setMessages(docs);

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
          await markChatAsRead(chatId, user.uid);
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
  }, [chatId]);

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
    contentType,
    mediaType,
    localPreviewUrl,
  }: {
    blob: Blob;
    fileName: string;
    contentType: string;
    mediaType: MediaType;
    localPreviewUrl: string;
  }) => {
    const user = auth.currentUser;

    if (!user || !chatId) return;

    const clientMessageId = createClientMessageId(user.uid);
    const replyPayload = buildReplyPayload();

    const optimisticMessage: MessageData = {
      id: clientMessageId,
      texto: "",
      fromUid: user.uid,
      createdAt: new Date(),
      clientMessageId,
      optimistic: true,
      status: "sending",
      uploadProgress: 0,
      readBy: { [user.uid]: true },
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
      const safeName = fileName.replace(/[^\w.\-]+/g, "_");
      const storagePath = `chats/${chatId}/${clientMessageId}_${safeName}`;
      const storageRef = ref(storage, storagePath);

      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType,
      });

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );

            setOptimisticMessages((prev) =>
              prev.map((msg) =>
                msg.clientMessageId === clientMessageId
                  ? { ...msg, uploadProgress: progress }
                  : msg
              )
            );
          },
          reject,
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (e) {
              reject(e);
            }
          }
        );
      });

      await addDoc(collection(db, "chats", chatId, "mensajes"), {
        texto: "",
        fromUid: user.uid,
        createdAt: serverTimestamp(),
        clientMessageId,
        mediaUrl: downloadUrl,
        mediaType,
        mediaName: fileName,
        mediaSize: blob.size,
        readBy: { [user.uid]: true },
        ...replyPayload,
      });

      await updateDoc(doc(db, "chats", chatId), {
        lastMessage: mediaLabel(mediaType),
        lastMessageSender: user.uid,
        updatedAt: serverTimestamp(),
        ["typing." + user.uid]: false,
        ["readBy." + user.uid]: true,
      });

      notifyModerationActivity({
        lastMessage: mediaLabel(mediaType),
        lastMessageSender: user.uid,
        initiatorUid: user.uid,
        anonOwnerUid: user.uid,
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

  const sendMessage = async () => {
    const user = auth.currentUser;
    if (!user || !text.trim() || !chatId) return;

    const clean = text.trim();
    const clientMessageId = createClientMessageId(user.uid);
    const replyPayload = buildReplyPayload();

    const optimisticMessage: MessageData = {
      id: clientMessageId,
      texto: clean,
      fromUid: user.uid,
      createdAt: new Date(),
      clientMessageId,
      optimistic: true,
      status: "sending",
      readBy: { [user.uid]: true },
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
        fromUid: user.uid,
        createdAt: serverTimestamp(),
        clientMessageId,
        readBy: { [user.uid]: true },
        ...replyPayload,
      });

      await updateDoc(doc(db, "chats", chatId), {
        lastMessage: clean,
        lastMessageSender: user.uid,
        updatedAt: serverTimestamp(),
        ["typing." + user.uid]: false,
        ["readBy." + user.uid]: true,
      });

      notifyModerationActivity({
        lastMessage: clean,
        lastMessageSender: user.uid,
        initiatorUid: user.uid,
        anonOwnerUid: user.uid,
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
    fileInputRef.current?.click();
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
    if (recording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      recordingStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setRecording(false);

        if (audioBlob.size <= 0) return;

        const localPreviewUrl = URL.createObjectURL(audioBlob);

        await uploadMediaMessage({
          blob: audioBlob,
          fileName: "audio_" + Date.now() + ".webm",
          contentType: audioBlob.type || "audio/webm",
          mediaType: "audio",
          localPreviewUrl,
        });
      };

      recorder.start();
      setRecording(true);
    } catch (e) {
      console.error(e);
      setRecording(false);
      alert("No se pudo acceder al micr├│fono.");
    }
  };

  const stopRecording = () => {
    if (!recording) return;

    try {
      mediaRecorderRef.current?.stop();
    } catch (e) {
      console.error(e);
      setRecording(false);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  };

  const otherTyping = useMemo(() => {
    return Object.entries(chat?.typing || {}).some(
      ([typingUid, value]) => typingUid !== currentUid && value
    );
  }, [chat, currentUid]);

  
if (uxMode === "classic") {
    return (
      <main className="flex min-h-screen flex-col bg-[#050505] text-white">
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
            {visibleMessages.map((message: any) => {
              const isMine = message.fromUid === currentUid;
              const receiptStatus = resolveMessageReceiptStatus({
                mine: isMine,
                readBy: message.readBy,
                senderId: currentUid,
              });

              return (
                <div
                  key={message.id}
                  className={[
                    "flex flex-col",
                    isMine ? "items-end" : "items-start",
                  ].join(" ")}
                >
                  <div
                    className={
                      isMine
                        ? "max-w-[82%] rounded-lg rounded-br-sm bg-violet-600 px-4 py-2.5 text-sm leading-snug text-white shadow-[0_0_18px_rgba(139,92,246,0.22)]"
                        : "max-w-[82%] rounded-lg rounded-bl-sm border border-white/10 bg-[#111111] px-4 py-2.5 text-sm leading-snug text-zinc-200"
                    }
                  >
                    {message.texto || "Mensaje"}
                  </div>

                  {receiptStatus ? <ChatMessageReceipt status={receiptStatus} /> : null}
                </div>
              );
            })}
          </div>
        </section>

        <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
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
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-black text-white">
      <div className="border-b border-white/10 bg-zinc-950 px-5 py-4">
        <h1 className="text-lg font-black">Chat an├│nimo</h1>

        {otherTyping && (
          <p className="mt-1 text-xs font-bold text-fuchsia-300">
            escribiendo...
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {visibleMessages.map((msg) => {
            const mine = msg.fromUid === currentUid;
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
                <button
                  type="button"
                  onClick={() => startReply(msg)}
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

                  {hasMedia && msg.mediaType === "audio" && (
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200">
                        Audio
                      </p>

                      <audio
                        src={msg.mediaUrl}
                        controls
                        className="w-full max-w-[260px]"
                        onClick={(e) => e.stopPropagation()}
                      />

                      {isSending && (
                        <p className="mt-3 text-xs font-black text-white/80">
                          Subiendo... {msg.uploadProgress || 0}%
                        </p>
                      )}
                    </div>
                  )}

                  {msg.texto && (
                    <p className={hasMedia ? "mt-3" : ""}>{msg.texto}</p>
                  )}

                  {!msg.texto && !hasMedia && (
                    <p className="text-white/70">Mensaje</p>
                  )}
                </button>

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
            className="hidden"
            onChange={handleMediaSelected}
          />

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
              onClick={recording ? stopRecording : startRecording}
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
    </main>
  );
}
