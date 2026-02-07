"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { auth, db } from "@/lib/firebase";
import {
  subscribeToMessages,
  sendMessage,
  uploadToCloudinary,
  sendFile,
  getOtherUser,
} from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SendHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  Pin,
  PlusCircle,
  ArrowBigLeft,
} from "lucide-react";

// Types
interface UserProfile {
  username: string;
  photoURL: string;
  email: string;
}

interface Message {
  id: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  timestamp: any;
  isEdited?: boolean;
  mediaUrl?: string;
  mediaId?: string;
}

interface PinnedMessage {
  id: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  timestamp: any;
}

// Constants
const NOTIFICATION_SOUND_PATH = "/ping.mp3";
const MAX_IMAGE_WIDTH = "50vw";
const SCROLL_DELAY = 100;

export default function ChatInterface() {
  const router = useRouter();
  const params = useParams();
  const chatId = params.chatId as string;

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Auth state management
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDocSnap = await import("firebase/firestore").then(({ getDoc }) =>
          getDoc(userDocRef)
        );

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserProfile;
          setCurrentUser(userData);
        } else {
          console.error("User profile not found in Firestore");
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    });

    return unsubscribe;
  }, [router]);

  // Messages subscription
  useEffect(() => {
    if (!chatId) return;

    const unsubscribe = subscribeToMessages(chatId, (newMessages) => {
      setMessages(newMessages);
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, SCROLL_DELAY);
    });

    return unsubscribe;
  }, [chatId]);

  // Pinned message subscription
  useEffect(() => {
    if (!chatId) return;

    const pinnedMessageRef = doc(db, "chats", chatId, "pinnedMessage", "current");
    const unsubscribe = onSnapshot(pinnedMessageRef, (docSnap) => {
      if (docSnap.exists()) {
        setPinnedMessage({ id: docSnap.id, ...docSnap.data() } as PinnedMessage);
      } else {
        setPinnedMessage(null);
      }
    });

    return unsubscribe;
  }, [chatId]);

  // Window focus tracking
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_PATH);

    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Notification sound for new messages
  useEffect(() => {
    if (messages.length <= prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const isOwnMessage = lastMessage.senderName === currentUser?.username;

    if (!isWindowFocused && !isOwnMessage) {
      audioRef.current
        ?.play()
        .catch((err) => console.log("Audio playback blocked:", err));
    }

    prevMessageCountRef.current = messages.length;
  }, [messages, isWindowFocused, currentUser?.username]);

  // Handlers
  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!messageInput.trim() || !currentUser) return;

      const messageText = messageInput;
      setMessageInput("");

      try {
        await sendMessage(chatId, messageText, {
          name: currentUser.username,
          photo: currentUser.photoURL,
        });
      } catch (error) {
        console.error("Error sending message:", error);
        // Restore message on error
        setMessageInput(messageText);
      }
    },
    [chatId, messageInput, currentUser]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        const messageRef = doc(db, "chats", chatId, "messages", messageId);
        await deleteDoc(messageRef);
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    },
    [chatId]
  );

  const handlePinMessage = useCallback(
    async (senderName: string, senderPhoto: string, text: string) => {
      try {
        const pinnedRef = doc(db, "chats", chatId, "pinnedMessage", "current");
        await setDoc(pinnedRef, {
          senderName,
          senderPhoto,
          text,
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error pinning message:", error);
      }
    },
    [chatId]
  );

  const handleStartEdit = useCallback((message: Message) => {
    setEditingMessageId(message.id);
    setEditText(message.text);
  }, []);

  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      if (!editText.trim()) return;

      try {
        const messageRef = doc(db, "chats", chatId, "messages", messageId);
        await updateDoc(messageRef, {
          text: editText,
          isEdited: true,
        });
        setEditingMessageId(null);
        setEditText("");
      } catch (error) {
        console.error("Error editing message:", error);
      }
    },
    [chatId, editText]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditText("");
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentUser || isUploading) return;

      setIsUploading(true);

      try {
        const uploadedMedia = await uploadToCloudinary(file);

        await sendFile(chatId, messageInput, {
          name: currentUser.username,
          photo: currentUser.photoURL,
          mediaUrl: uploadedMedia.url,
          mediaId: uploadedMedia.publicId,
        });

        setMessageInput("");
      } catch (error) {
        console.error("File upload error:", error);
      } finally {
        setIsUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [chatId, messageInput, currentUser, isUploading]
  );

  const handleUnpinMessage = useCallback(async () => {
    try {
      const pinnedRef = doc(db, "chats", chatId, "pinnedMessage", "current");
      await deleteDoc(pinnedRef);
    } catch (error) {
      console.error("Error unpinning message:", error);
    }
  }, [chatId]);

  const handleFileInputClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Get other user's name
  const otherUserName = currentUser ? getOtherUser(chatId, currentUser.username) || "" : "";

  // Render messages with grouping
  const renderMessages = () => {
    let previousSenderName = "";

    return messages.map((message) => {
      const showAvatar = previousSenderName !== message.senderName;
      const isCurrentUserMessage = currentUser?.username === message.senderName;

      previousSenderName = message.senderName;

      return (
        <MessageItem
          key={message.id}
          message={message}
          showAvatar={showAvatar}
          isCurrentUserMessage={isCurrentUserMessage}
          isEditing={editingMessageId === message.id}
          editText={editText}
          onEdit={handleStartEdit}
          onDelete={handleDeleteMessage}
          onPin={handlePinMessage}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onEditTextChange={setEditText}
        />
      );
    });
  };

  return (
    <>
      <ChatNavbar
        otherUserName={otherUserName}
        pinnedMessage={pinnedMessage}
        onUnpinMessage={handleUnpinMessage}
        chatId={chatId}
      />

      <div className="flex flex-col h-screen bg-black text-[#dbdee1]">
        <ScrollArea className="flex-1 px-4 pb-20 mt-16 bg-black">
          <div className="py-6">
            {renderMessages()}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      <MessageInputForm
        messageInput={messageInput}
        isUploading={isUploading}
        onMessageChange={setMessageInput}
        onSubmit={handleSendMessage}
        onFileInputClick={handleFileInputClick}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
      />
    </>
  );
}

// Sub-components

interface ChatNavbarProps {
  otherUserName: string;
  pinnedMessage: PinnedMessage | null;
  onUnpinMessage: () => void;
  chatId: string;
}

function ChatNavbar({ otherUserName, pinnedMessage, onUnpinMessage, chatId }: ChatNavbarProps) {
  return (
    <nav className="fixed top-0 w-full z-10 border-b border-white/10 bg-black/50 backdrop-blur-md">
      <div className="mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex gap-4 items-center">
          <Button asChild>
            <Link href="/me">
              <ArrowBigLeft />
            </Link>
          </Button>

          <PinnedMessageDialog
            pinnedMessage={pinnedMessage}
            onUnpinMessage={onUnpinMessage}
          />

          <p className="text-white font-bold">{otherUserName}</p>
        </div>
      </div>
    </nav>
  );
}

interface PinnedMessageDialogProps {
  pinnedMessage: PinnedMessage | null;
  onUnpinMessage: () => void;
}

function PinnedMessageDialog({ pinnedMessage, onUnpinMessage }: PinnedMessageDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Pin className="w-6 h-6" />
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-[#1e1f22] border-zinc-800 text-[#dbdee1] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Pin className="w-4 h-4 text-indigo-400" />
            Pinned Messages
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {pinnedMessage ? (
            <div className="bg-[#2b2d31] p-3 rounded-md border border-white/5 relative group">
              <div className="flex items-center gap-3 mb-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={pinnedMessage.senderPhoto} />
                  <AvatarFallback className="text-[10px] bg-indigo-500">
                    {pinnedMessage.senderName?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-bold text-white">
                  {pinnedMessage.senderName}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {pinnedMessage.timestamp?.toDate().toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm leading-relaxed wrap-break-word">{pinnedMessage.text}</p>

              <button
                onClick={onUnpinMessage}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
                aria-label="Unpin message"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-center py-10">
              <Pin className="w-12 h-12 text-zinc-700 mx-auto mb-2 opacity-20" />
              <p className="text-zinc-500 text-sm">No pinned messages yet.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface MessageItemProps {
  message: Message;
  showAvatar: boolean;
  isCurrentUserMessage: boolean;
  isEditing: boolean;
  editText: string;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onPin: (senderName: string, senderPhoto: string, text: string) => void;
  onSaveEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onEditTextChange: (text: string) => void;
}

function MessageItem({
  message,
  showAvatar,
  isCurrentUserMessage,
  isEditing,
  editText,
  onEdit,
  onDelete,
  onPin,
  onSaveEdit,
  onCancelEdit,
  onEditTextChange,
}: MessageItemProps) {
  return (
    <div className="relative flex items-start gap-4 group hover:bg-[#111111] -mx-4 px-4 py-1 transition-colors">
      {/* Action buttons */}
      <div className="absolute top-0 right-4 hidden group-hover:flex gap-1 bg-[#1d1d1d] border border-white/10 rounded-md shadow-lg p-1 z-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
          onClick={() => onPin(message.senderName, message.senderPhoto, message.text)}
          aria-label="Pin message"
        >
          <Pin className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
          onClick={() => onEdit(message)}
          aria-label="Edit message"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-red-400"
          onClick={() => onDelete(message.id)}
          aria-label="Delete message"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Avatar */}
      {showAvatar ? (
        <Avatar className="w-10 h-10 mt-1">
          <AvatarImage src={message.senderPhoto} alt={message.senderName} />
          <AvatarFallback className="bg-indigo-500 text-white">
            {message.senderName?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="w-10" />
      )}

      {/* Message content */}
      <div className="flex flex-col flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white">{message.senderName}</span>
            <span className="text-xs text-zinc-500">
              {message.timestamp?.toDate().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {message.isEdited && (
                <span className="ml-1 text-[10px] italic">(edited)</span>
              )}
            </span>
          </div>
        )}

        {isEditing ? (
          <MessageEditForm
            editText={editText}
            onEditTextChange={onEditTextChange}
            onSave={() => onSaveEdit(message.id)}
            onCancel={onCancelEdit}
          />
        ) : (
          <MessageContent message={message} />
        )}
      </div>
    </div>
  );
}

interface MessageEditFormProps {
  editText: string;
  onEditTextChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function MessageEditForm({
  editText,
  onEditTextChange,
  onSave,
  onCancel,
}: MessageEditFormProps) {
  return (
    <div className="mt-1 flex flex-col gap-2">
      <input
        className="bg-[#2b2d31] text-white p-2 rounded-md outline-none w-full border border-indigo-500 focus:ring-2 focus:ring-indigo-400"
        value={editText}
        onChange={(e) => onEditTextChange(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
      />
      <div className="flex gap-2 text-xs">
        <button
          onClick={onSave}
          className="text-indigo-400 hover:underline flex items-center gap-1"
        >
          <Check className="w-3 h-3" /> Save
        </button>
        <button
          onClick={onCancel}
          className="text-zinc-500 hover:underline flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

interface MessageContentProps {
  message: Message;
}

function MessageContent({ message }: MessageContentProps) {
  return (
    <>
      <div className="text-[#dbdee1] leading-relaxed wrap-break-word overflow-hidden">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold border-b border-zinc-700 pb-1 mt-2 mb-1 text-white">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-bold mt-2 mb-1 text-white">{children}</h2>
            ),
            strong: ({ children }) => (
              <strong className="font-bold text-white">{children}</strong>
            ),
            em: ({ children }) => <em className="italic">{children}</em>,
            a: ({ href, children }) => {
              const isYouTube = href?.includes("youtube.com") || href?.includes("youtu.be");
              return (
                <>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00a8fc] hover:underline break-all"
                  >
                    {children}
                  </a>
                  {isYouTube && href && <YouTubeEmbed url={href} />}
                </>
              );
            },
            ul: ({ children }) => (
              <ul className="list-disc ml-5 space-y-1 my-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal ml-5 space-y-1 my-1">{children}</ol>
            ),
            code: ({ node, inline, className, children, ...props }: any) => {
              return inline ? (
                <code
                  className="bg-[#2e3035] px-1.5 py-0.5 rounded text-sm font-mono text-[#e3e5e8]"
                  {...props}
                >
                  {children}
                </code>
              ) : (
                <pre className="bg-[#1e1f22] p-3 rounded-md border border-black/20 my-2 overflow-x-auto">
                  <code className="text-sm font-mono text-[#dbdee1]" {...props}>
                    {children}
                  </code>
                </pre>
              );
            },
          }}
        >
          {message.text}
        </ReactMarkdown>
      </div>
      {message.mediaUrl && (
        <img
          src={message.mediaUrl}
          alt="Uploaded media"
          className="max-w-[50vw] w-fit rounded-md mt-2"
          loading="lazy"
        />
      )}
    </>
  );
}

interface YouTubeEmbedProps {
  url: string;
}

function YouTubeEmbed({ url }: YouTubeEmbedProps) {
  const videoId = extractYouTubeId(url);

  if (!videoId) return null;

  return (
    <div className="my-2 max-w-100 w-full border border-white/10 rounded-xl overflow-hidden shadow-lg bg-black">
      <div className="relative aspect-video">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute top-0 left-0 w-full h-full border-0"
        />
      </div>
    </div>
  );
}

function extractYouTubeId(url: string): string | null {
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

interface MessageInputFormProps {
  messageInput: string;
  isUploading: boolean;
  onMessageChange: (text: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onFileInputClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function MessageInputForm({
  messageInput,
  isUploading,
  onMessageChange,
  onSubmit,
  onFileInputClick,
  fileInputRef,
  onFileUpload,
}: MessageInputFormProps) {
  return (
    <div className="fixed bottom-0 w-screen">
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 bg-[#111111] rounded-lg px-4 py-2 shadow-inner"
      >
        <button
          type="button"
          onClick={onFileInputClick}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          disabled={isUploading}
          aria-label="Upload file"
        >
          <PlusCircle className="w-6 h-6" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/*,video/*"
          onChange={onFileUpload}
          disabled={isUploading}
        />

        <input
          value={messageInput}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder={isUploading ? "Uploading..." : "Message"}
          className="flex-1 bg-[#1d1d1d] border-none outline-none rounded-lg p-2 px-4 focus-visible:ring-0 text-[#dbdee1] placeholder:text-zinc-500"
          disabled={isUploading}
        />

        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="hover:bg-[#1d1d1d] text-zinc-400 hover:text-white"
          disabled={!messageInput.trim() || isUploading}
        >
          <SendHorizontal className="w-5 h-5" />
        </Button>
      </form>
    </div>
  );
}


// "use client";

// import React, { useEffect, useState, useRef } from "react";
// import { auth, db } from "@/lib/firebase";
// import {
//   subscribeToMessages,
//   sendMessage,
//   uploadToCloudinary,
//   sendFile,
//   getOtherUser,
// } from "@/lib/api";
// import { ScrollArea } from "@/components/ui/scroll-area";
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// import { Button } from "@/components/ui/button";
// import {
//   SendHorizontal,
//   Pencil,
//   Trash2,
//   Check,
//   X,
//   Pin,
//   PlusCircle,
//   ArrowBigLeft,
// } from "lucide-react";
// import { useParams, useRouter } from "next/navigation";
// import {
//   deleteDoc,
//   doc,
//   getDoc,
//   onSnapshot,
//   serverTimestamp,
//   setDoc,
//   updateDoc,
// } from "firebase/firestore";
// import { onAuthStateChanged } from "firebase/auth";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog";
// import ReactMarkdown from "react-markdown";
// import Link from "next/link";
// import remarkGfm from "remark-gfm";

// export default function ChatInterface() {
//   const router = useRouter();
//   const params = useParams();
//   const chatId = params.chatId as string;
//   const authUser = auth.currentUser;
//   const [user, setUser] = useState<any>(null);
//   const [messages, setMessages] = useState<any[]>([]);
//   const [newMessage, setNewMessage] = useState("");
//   const scrollRef = useRef<HTMLDivElement>(null);
//   const [editingId, setEditingId] = useState<string | null>(null);
//   const [editText, setEditText] = useState("");
//   useEffect(() => {
//     // Use the listener instead of the static authUser variable
//     const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
//       if (firebaseUser) {
//         try {
//           const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
//           if (userDoc.exists()) {
//             const data = userDoc.data();
//             console.log("User profile fetched:", data);
//             setUser(data);
//           } else {
//             console.warn("No Firestore document found for this UID.");
//           }
//         } catch (error) {
//           console.error("Error fetching profile:", error);
//         }
//       } else {
//         setUser(null);
//       }
//     });

//     return () => unsubscribe();
//   }, []);

//   useEffect(() => {
//     const unsubscribe = subscribeToMessages(chatId, (msgs) => {
//       setMessages(msgs);
//       console.log(msgs);

//       setTimeout(
//         () => scrollRef.current?.scrollIntoView({ behavior: "smooth" }),
//         100,
//       );
//     });
//     return () => unsubscribe();
//   }, [chatId]);

//   useEffect(() => {
//     const unsubscribe = onAuthStateChanged(auth, (user) => {
//       if (!user) {
//         router.push("/login");
//       }
//     });

//     return () => unsubscribe();
//   }, [router]);

//   const handleSend = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!newMessage.trim() || !user) return;

//     const text = newMessage;
//     setNewMessage("");
//     await sendMessage(chatId, text, {
//       name: user.username,
//       photo: user.photoURL,
//     });
//   };

//   const deleteMessage = async (chatId: string, messageId: string) => {
//     try {
//       const messageRef = doc(db, "chats", chatId, "messages", messageId);
//       await deleteDoc(messageRef);
//     } catch (error) {
//       console.error("Error deleting message:", error);
//     }
//   };
//   // const pinMessage = async (text: string) => {
//   //   const messagesRef = collection(db, "chats", chatId, "pinnedMessage");

//   //   await addDoc(messagesRef, {
//   //     senderName: user.username,
//   //     senderPhoto: user.photoURL,
//   //     text,
//   //     timestamp: serverTimestamp(),
//   //   });
//   // };

//   const pinMessage = async (name: string, photo: string, text: string) => {
//     const pinnedRef = doc(db, "chats", chatId, "pinnedMessage", "current");

//     await setDoc(pinnedRef, {
//       senderName: name,
//       senderPhoto: photo,
//       text,
//       timestamp: serverTimestamp(),
//     });
//   };

//   const editMessage = async (
//     chatId: string,
//     messageId: string,
//     newText: string,
//   ) => {
//     try {
//       const messageRef = doc(db, "chats", chatId, "messages", messageId);
//       await updateDoc(messageRef, {
//         text: newText,
//         isEdited: true,
//       });
//     } catch (error) {
//       console.error("Error editing message:", error);
//     }
//   };

//   const handleStartEdit = (msg: any) => {
//     setEditingId(msg.id);
//     setEditText(msg.text);
//   };

//   const handleSaveEdit = async (msgId: string) => {
//     if (!editText.trim()) return;
//     await editMessage(chatId, msgId, editText);
//     setEditingId(null);
//   };

//   const YouTubeEmbed = ({ url }: { url: string }) => {
//     const regExp =
//       /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
//     const match = url.match(regExp);
//     const videoId = match && match[2].length === 11 ? match[2] : null;
//     //  = getYouTubeID(url);

//     if (!videoId) return null;

//     return (
//       <div className="my-2 max-w-[400px] w-full border border-white/10 rounded-xl overflow-hidden shadow-lg bg-black">
//         <div className="relative aspect-video">
//           <iframe
//             src={`https://www.youtube.com/embed/${videoId}`}
//             title="YouTube video player"
//             allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
//             allowFullScreen
//             className="absolute top-0 left-0 w-full h-full border-0"
//           />
//         </div>
//       </div>
//     );
//   };

//   function groupMessage() {
//     let lastSender: string = "";
//     return messages.map((msg) => {
//       let data = (
//         <div
//           key={msg.id}
//           className="relative flex items-start gap-4 group hover:bg-[#111111] -mx-4 px-4 py-1 transition-colors"
//         >
//           {(user?.username === msg.senderName || true) && (
//             <div className="absolute top-0 right-4 hidden group-hover:flex gap-1 bg-[#1d1d1d] border border-white/10 rounded-md shadow-lg p-1 z-10">
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 className="h-8 w-8 text-zinc-400 hover:text-zinc-700"
//                 onClick={() =>
//                   pinMessage(msg.senderName, msg.senderPhoto, msg.text)
//                 }
//               >
//                 <Pin className="w-4 h-4" />
//               </Button>
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 className="h-8 w-8 text-zinc-400 hover:text-zinc-700"
//                 onClick={() => handleStartEdit(msg)}
//               >
//                 <Pencil className="w-4 h-4" />
//               </Button>
//               <Button
//                 variant="ghost"
//                 size="icon"
//                 className="h-8 w-8 text-zinc-400 hover:text-zinc-700"
//                 onClick={() => deleteMessage(chatId, msg.id)}
//               >
//                 <Trash2 className="w-4 h-4" />
//               </Button>
//             </div>
//           )}

//           {lastSender != msg.senderName ? (
//             <Avatar className="w-10 h-10 mt-1">
//               <AvatarImage src={msg.senderPhoto} />
//               <AvatarFallback className="bg-indigo-500 text-white">
//                 {msg.senderName?.[0]?.toUpperCase()}
//               </AvatarFallback>
//             </Avatar>
//           ) : (
//             <div className="px-5"> </div>
//           )}
//           <div className="flex flex-col flex-1">
//             {lastSender != msg.senderName && (
//               <div className="flex items-center gap-2">
//                 <span className="font-semibold text-white">
//                   {msg.senderName}
//                 </span>
//                 <span className="text-xs text-zinc-500">
//                   {msg.timestamp?.toDate().toLocaleTimeString([], {
//                     hour: "2-digit",
//                     minute: "2-digit",
//                   })}
//                   {msg.isEdited && (
//                     <span className="ml-1 text-[10px] italic">(edited)</span>
//                   )}
//                 </span>
//               </div>
//             )}
//             {editingId === msg.id ? (
//               <div className="mt-1 flex flex-col gap-2">
//                 <input
//                   className="bg-[#2b2d31] text-white p-2 rounded-md outline-none w-full border border-indigo-500"
//                   value={editText}
//                   onChange={(e) => setEditText(e.target.value)}
//                   autoFocus
//                 />
//                 <div className="flex gap-2 text-xs">
//                   <button
//                     onClick={() => handleSaveEdit(msg.id)}
//                     className="text-indigo-400 hover:underline flex items-center gap-1"
//                   >
//                     <Check className="w-3 h-3" /> Save
//                   </button>
//                   <button
//                     onClick={() => setEditingId(null)}
//                     className="text-zinc-500 hover:underline flex items-center gap-1"
//                   >
//                     <X className="w-3 h-3" /> Cancel
//                   </button>
//                 </div>
//               </div>
//             ) : (
//               <>
//                 <div className="text-[#dbdee1] leading-relaxed wrap-break-word overflow-hidden">
//                   <ReactMarkdown
//                     remarkPlugins={[remarkGfm]}
//                     components={{
//                       // Headers
//                       h1: ({ children }) => (
//                         <h1 className="text-xl font-bold border-b border-zinc-700 pb-1 mt-2 mb-1 text-white">
//                           {children}
//                         </h1>
//                       ),
//                       h2: ({ children }) => (
//                         <h2 className="text-lg font-bold mt-2 mb-1 text-white">
//                           {children}
//                         </h2>
//                       ),

//                       // Bold/Italic
//                       strong: ({ children }) => (
//                         <strong className="font-bold text-white">
//                           {children}
//                         </strong>
//                       ),
//                       em: ({ children }) => (
//                         <em className="italic">{children}</em>
//                       ),

//                       // Links
//                       a: ({ href, children }) => {
//                         const isYouTube =
//                           href?.includes("youtube.com") ||
//                           href?.includes("youtu.be");
//                         return (
//                           <>
//                             <a
//                               href={href}
//                               target="_blank"
//                               rel="noreferrer"
//                               className="text-[#00a8fc] hover:underline"
//                             >
//                               {children}
//                             </a>
//                             {isYouTube && href && <YouTubeEmbed url={href} />}
//                           </>
//                         );
//                       },

//                       // Lists
//                       ul: ({ children }) => (
//                         <ul className="list-disc ml-5 space-y-1 my-1">
//                           {children}
//                         </ul>
//                       ),
//                       ol: ({ children }) => (
//                         <ol className="list-decimal ml-5 space-y-1 my-1">
//                           {children}
//                         </ol>
//                       ),

//                       // Code Blocks
//                       code: ({
//                         node,
//                         inline,
//                         className,
//                         children,
//                         ...props
//                       }: any) => {
//                         return inline ? (
//                           <code
//                             className="bg-[#2e3035] px-1.2 rounded text-sm font-mono text-[#e3e5e8]"
//                             {...props}
//                           >
//                             {children}
//                           </code>
//                         ) : (
//                           <pre className="bg-[#1e1f22] p-3 rounded-md border border-black/20 my-2 overflow-x-auto">
//                             <code
//                               className="text-sm font-mono text-[#dbdee1]"
//                               {...props}
//                             >
//                               {children}
//                             </code>
//                           </pre>
//                         );
//                       },
//                     }}
//                   >
//                     {msg.text}
//                   </ReactMarkdown>
//                 </div>
//                 {msg.mediaUrl && (
//                   <img
//                     src={msg.mediaUrl}
//                     alt="image"
//                     className="max-w-[50vw] w-fit"
//                   />
//                 )}
//               </>
//             )}
//           </div>
//         </div>
//       );
//       lastSender = msg.senderName;
//       return data;
//     });
//   }

//   const [isFocused, setIsFocused] = useState(true);
//   const audioRef = useRef<HTMLAudioElement | null>(null);
//   const prevMsgCount = useRef(messages.length);

//   useEffect(() => {
//     audioRef.current = new Audio("/ping.mp3");
//     const handleFocus = () => setIsFocused(true);
//     const handleBlur = () => setIsFocused(false);
//     window.addEventListener("focus", handleFocus);
//     window.addEventListener("blur", handleBlur);
//     return () => {
//       window.removeEventListener("focus", handleFocus);
//       window.removeEventListener("blur", handleBlur);
//     };
//   }, []);
//   const [pinnedMsg, setPinnedMsg] = useState<any>(null);
//   // Fetch the pinned message in real-time
//   useEffect(() => {
//     const pinnedRef = doc(db, "chats", chatId, "pinnedMessage", "current");
//     const unsubscribe = onSnapshot(pinnedRef, (docSnap) => {
//       console.log("pinned", docSnap);

//       if (docSnap.exists()) {
//         setPinnedMsg({ id: docSnap.id, ...docSnap.data() });
//       } else {
//         setPinnedMsg(null);
//       }
//     });
//     return () => unsubscribe();
//   }, [chatId]);

//   useEffect(() => {
//     if (messages.length > prevMsgCount.current) {
//       const lastMsg = messages[messages.length - 1];
//       if (!isFocused && lastMsg.senderName !== user?.username) {
//         audioRef.current
//           ?.play()
//           .catch((err) => console.log("Audio play blocked by browser:", err));
//       }
//     }
//     prevMsgCount.current = messages.length;
//   }, [messages, isFocused, user?.username]);

//   const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file || !user) return;

//     try {
//       // 1. Upload to Cloudinary
//       const media = await uploadToCloudinary(file);

//       await sendFile(chatId, newMessage, {
//         name: user.username,
//         photo: user.photoURL,
//         mediaUrl: media.url,
//         mediaId: media.publicId,
//       });
//       setNewMessage("");
//     } catch (error) {
//       console.error("Upload Error:", error);
//     }
//   };
//   return (
//     <>
//       {/* <Navbar></Navbar> */}
//       <nav className="fixed top-0 w-full z-10 border-b border-white/10 bg-black/50 backdrop-blur-md">
//         <div className="mx-auto px-4 h-16 flex items-center justify-between">
//           <div className="flex gap-4 items-center">
//             <Button>
//               <Link href="/me">
//                 <ArrowBigLeft />
//               </Link>
//             </Button>
//             <Dialog>
//               <DialogTrigger asChild>
//                 <Button
//                   type="button"
//                   className="text-zinc-400 hover:text-zinc-200 transition-colors"
//                 >
//                   <Pin className="w-6 h-6" />
//                 </Button>
//               </DialogTrigger>

//               <DialogContent className="bg-[#1e1f22] border-zinc-800 text-[#dbdee1] sm:max-w-106.25">
//                 <DialogHeader>
//                   <DialogTitle className="flex items-center gap-2 text-white">
//                     <Pin className="w-4 h-4 text-indigo-400" />
//                     Pinned Messages
//                   </DialogTitle>
//                 </DialogHeader>

//                 <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
//                   {pinnedMsg ? (
//                     <div className="bg-[#2b2d31] p-3 rounded-md border border-white/5 relative group">
//                       <div className="flex items-center gap-3 mb-2">
//                         <Avatar className="w-6 h-6">
//                           <AvatarImage src={pinnedMsg.senderPhoto} />
//                           <AvatarFallback className="text-[10px] bg-indigo-500">
//                             {pinnedMsg.senderName?.[0]}
//                           </AvatarFallback>
//                         </Avatar>
//                         <span className="text-xs font-bold text-white">
//                           {pinnedMsg.senderName}
//                         </span>
//                         <span className="text-[10px] text-zinc-500">
//                           {pinnedMsg.timestamp?.toDate().toLocaleDateString()}
//                         </span>
//                       </div>
//                       <p className="text-sm leading-relaxed">
//                         {pinnedMsg.text}
//                       </p>

//                       <button
//                         onClick={() =>
//                           deleteDoc(
//                             doc(
//                               db,
//                               "chats",
//                               chatId,
//                               "pinnedMessage",
//                               "current",
//                             ),
//                           )
//                         }
//                         className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
//                       >
//                         <X className="w-4 h-4" />
//                       </button>
//                     </div>
//                   ) : (
//                     <div className="text-center py-10">
//                       <Pin className="w-12 h-12 text-zinc-700 mx-auto mb-2 opacity-20" />
//                       <p className="text-zinc-500 text-sm">
//                         No pinned messages yet.
//                       </p>
//                     </div>
//                   )}
//                 </div>
//               </DialogContent>
//             </Dialog>
//             <p className="text-white font-bold">
//               {user ? getOtherUser(chatId, user.username) : ""}
//             </p>
//           </div>
//         </div>
//       </nav>
//       <div className="flex flex-col h-screen bg-black text-[#dbdee1] ">
//         <ScrollArea className="flex-1 px-4 pb-20 mt-15 bg-black ">
//           <div className="py-6">
//             {groupMessage()}
//             <div ref={scrollRef} />
//           </div>
//         </ScrollArea>
//       </div>
//       <div className="fixed bottom-0 w-screen mt-30">
//         <form
//           onSubmit={handleSend}
//           className="flex items-center gap-2 bg-[#111111] rounded-lg px-4 py-2 shadow-inner"
//         >
//           <button
//             type="button"
//             onClick={() => document.getElementById("fileInput")?.click()}
//             className="text-zinc-400 hover:text-zinc-200"
//           >
//             <PlusCircle className="w-6 h-6" />
//           </button>
//           <input
//             id="fileInput"
//             type="file"
//             hidden
//             accept="image/*,video/*"
//             onChange={handleFileUpload}
//           />
//           <input
//             value={newMessage}
//             onChange={(e) => setNewMessage(e.target.value)}
//             placeholder="Message"
//             className="flex-1 bg-[#1d1d1d] border-none outline-none rounded-lg p-2 px-4 focus-visible:ring-0 text-[#dbdee1] placeholder:text-zinc-500"
//           />

//           <Button
//             type="submit"
//             size="icon"
//             variant="ghost"
//             className="hover:bg-[#1d1d1d] text-zinc-400 hover:text-white"
//           >
//             <SendHorizontal className="w-5 h-5" />
//           </Button>
//         </form>
//       </div>
//     </>
//   );
// }
