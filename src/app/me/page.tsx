"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth";
import { UserPlus } from "lucide-react";

import Navbar from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { subscribeToChats, createOrGetChat } from "@/lib/api";

// Types
interface ChatListItem {
  id: string;
  username: string;
  photoURL: string;
  email: string;
  message: string;
  timestamp: any;
}

export default function ChatsPage() {
  const router = useRouter();
  const [currentUser, isAuthLoading] = useAuthState(auth);

  // State
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [newChatUsername, setNewChatUsername] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, isAuthLoading, router]);

  // Subscribe to chats
  useEffect(() => {
    if (!currentUser?.email || isAuthLoading) return;

    const unsubscribe = subscribeToChats(currentUser.email, (chatData) => {
      setChats(chatData);
    });

    return unsubscribe;
  }, [currentUser, isAuthLoading]);

  // Handle creating a new chat
  const handleCreateChat = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!newChatUsername.trim()) {
        setError("Please enter a username");
        return;
      }

      if (!currentUser?.email) {
        setError("You must be logged in to create a chat");
        return;
      }

      setIsCreatingChat(true);

      try {
        const chatId = await createOrGetChat(
          currentUser.email,
          newChatUsername.trim(),
        );

        if (chatId) {
          setNewChatUsername("");
          router.push(`/chat/${chatId}`);
        } else {
          setError("User not found or chat creation failed");
        }
      } catch (err) {
        console.error("Error creating chat:", err);
        setError("Failed to create chat. Please try again.");
      } finally {
        setIsCreatingChat(false);
      }
    },
    [newChatUsername, currentUser, router],
  );

  // Format timestamp
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return "";

    try {
      return timestamp.toDate().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  // Loading state
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // Not authenticated (should redirect, but show fallback)
  if (!currentUser) {
    return null;
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-4 pt-24 pb-8">
          {/* Create new chat form */}
          <div className="max-w-2xl mx-auto mb-8">
            <form onSubmit={handleCreateChat} className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter username to start a chat"
                  value={newChatUsername}
                  onChange={(e) => setNewChatUsername(e.target.value)}
                  className="flex-1 bg-[#1d1d1d] text-white border border-white/20 rounded-md p-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  disabled={isCreatingChat}
                />
                <Button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6"
                  disabled={isCreatingChat || !newChatUsername.trim()}
                >
                  {isCreatingChat ? (
                    "Creating..."
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Start Chat
                    </>
                  )}
                </Button>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </form>
          </div>

          {/* Chat list */}
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-4 text-white/80">Your Chats</h2>

            {chats.length === 0 ? (
              <EmptyChatState />
            ) : (
              <div className="space-y-2">
                {chats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    formatTimestamp={formatTimestamp}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Sub-components

function EmptyChatState() {
  return (
    <div className="text-center py-12 bg-[#1d1d1d] rounded-lg border border-white/10">
      <div className="text-zinc-400 mb-2">
        <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-20" />
      </div>
      <h3 className="text-lg font-semibold text-white/70 mb-1">No chats yet</h3>
      <p className="text-zinc-500 text-sm">
        Enter a username above to start your first conversation
      </p>
    </div>
  );
}

interface ChatListItemProps {
  chat: ChatListItem;
  formatTimestamp: (timestamp: any) => string;
}

function ChatListItem({ chat, formatTimestamp }: ChatListItemProps) {
  return (
    <Link
      href={`/chat/${chat.id}`}
      className="flex items-start gap-4 p-4 rounded-lg hover:bg-[#1d1d1d] transition-colors group border border-transparent hover:border-white/5"
    >
      <Avatar className="w-12 h-12 mt-1 ring-2 ring-transparent group-hover:ring-indigo-500/20 transition-all">
        <AvatarImage src={chat.photoURL} alt={chat.username} />
        <AvatarFallback className="bg-indigo-500 text-white font-semibold">
          {chat.username[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-white group-hover:text-indigo-400 transition-colors truncate">
            {chat.username}
          </span>
          <span className="text-xs text-zinc-500 shrink-0">
            {formatTimestamp(chat.timestamp)}
          </span>
        </div>
        <p className="text-[#dbdee1] text-sm leading-relaxed truncate">
          {chat.message || "No messages yet"}
        </p>
      </div>

      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-indigo-400">→</div>
      </div>
    </Link>
  );
}

// "use client";
// import Navbar from "@/components/Navbar";
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// import { Button } from "@/components/ui/button";
// import { auth } from "@/lib/firebase";
// import { getChats, makeChat } from "@/lib/api";
// import { onAuthStateChanged } from "firebase/auth";

// import { UserPlus } from "lucide-react";
// import Link from "next/link";
// import { useRouter } from "next/navigation";
// import { useEffect, useState } from "react";
// import { useAuthState } from "react-firebase-hooks/auth";

// export default function FriendsPage() {
//   const router = useRouter();

//   const [userName, setUserName] = useState("");
//   const [user, loader] = useAuthState(auth);
//   const [chats, setChats] = useState<any[]>([]);

//   useEffect(() => {
//     if (!loader && user?.email) {
//       const unsubscribe = getChats(user.email, (chatData) => {
//         console.log(chatData);
//         setChats(chatData);
//       });

//       return () => unsubscribe();
//     }
//   }, [user, loader]);

//   useEffect(() => {
//     const unsubscribe = onAuthStateChanged(auth, (user) => {
//       if (!user && !loader) {
//         router.push("/login");
//       }
//     });

//     return () => unsubscribe();
//   }, [router, loader]);
//   // useEffect(() => {
//   //   const setupChatListener = async () => {
//   //     if (!loader && user?.email) {
//   //       const unsubscribe = await getChats(user.email, (chatData) => {
//   //         console.log("Updated Chat List:", chatData);
//   //         setChats(chatData);
//   //       });
//   //       return unsubscribe;
//   //     }
//   //   };
//   //   const subscriptionPromise = setupChatListener();

//   //   return () => {
//   //     subscriptionPromise.then((unsubscribe) => {
//   //       if (unsubscribe) unsubscribe();
//   //     });
//   //   };
//   // }, [user, loader]);

//   // useEffect(() => {
//   //   const setupSubscription = async () => {
//   //     if (!loader && user?.email) {
//   //       const unsubscribe = getChats(user.email, (chatData) => {
//   //         console.log("Chat Data Received:", chatData);
//   //         setChats(chatData);
//   //       });

//   //       return unsubscribe;
//   //     }
//   //   };

//   //   const subscriptionPromise = setupSubscription();

//   //   return () => {
//   //     subscriptionPromise.then((unsubscribe) => {
//   //       if (unsubscribe) unsubscribe();
//   //     });
//   //   };
//   // }, [user, loader]);

//   if (loader)
//     return (
//       <div className="min-h-screen bg-black flex items-center justify-center text-white">
//         Loading...
//       </div>
//     );

//   return (
//     <>
//       <Navbar />
//       <div className="min-h-screen bg-black text-white w-screen flex justify-center items-center">
//         {user ? (
//           <div className="min-h-screen mt-20">
//             <form
//               onSubmit={async (e) => {
//                 e.preventDefault();
//                 if (user?.email) makeChat(user.email, userName);
//               }}
//               className="flex gap-2 justify-center items-center"
//             >
//               <input
//                 placeholder="start chat with"
//                 value={userName}
//                 onChange={(e) => setUserName(e.target.value)}
//                 className="bg-black text-white border-white border-2 rounded-md p-2 outline-none"
//               />
//               <Button
//                 type="submit"
//                 className="bg-white hover:bg-gray-400 text-black p-2"
//               >
//                 <UserPlus className="w-4 h-4 mr-2" /> start
//               </Button>
//             </form>
//             <div className="mt-10 flex flex-col gap-5">
//               {chats.map((msg, i) => (
//                 <Link
//                   href={"/chat/" + msg.id}
//                   key={msg.id}
//                   className="flex items-start gap-4 group hover:bg-[#2e3035] -mx-4 px-4 py-1 transition-colors"
//                 >
//                   <Avatar className="w-10 h-10 mt-1">
//                     <AvatarImage src={msg.photoURL} />
//                     <AvatarFallback className="bg-indigo-500 text-white">
//                       {msg.username[0].toUpperCase()}
//                     </AvatarFallback>
//                   </Avatar>

//                   <div className="flex flex-col">
//                     <div className="flex items-center gap-2">
//                       <span className="font-semibold text-white hover:underline cursor-pointer">
//                         {msg.username}
//                       </span>
//                       <span className="text-xs text-zinc-500">
//                         {msg.timestamp?.toDate().toLocaleTimeString([], {
//                           hour: "2-digit",
//                           minute: "2-digit",
//                         })}
//                       </span>
//                     </div>
//                     <p className="text-[#dbdee1] leading-relaxed">
//                       {msg.message}
//                     </p>
//                   </div>
//                 </Link>

//                 // <div className="p-2 border-2 border-white" key={i}>
//                 //   <Link href={"/chat/" + msg.id} className="text-muted">
//                 //     {msg.id}
//                 //   </Link>
//                 //   <p> {msg.lastMessage}</p>
//                 // </div>
//               ))}
//             </div>
//           </div>
//         ) : (
//           <div>bruh</div>
//         )}
//       </div>
//     </>
//   );
// }
