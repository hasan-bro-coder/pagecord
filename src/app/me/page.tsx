"use client";
import Navbar from "@/components/Navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { getChats, makeChat } from "@/lib/friends";
import { onAuthStateChanged } from "firebase/auth";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";

export default function FriendsPage() {
  const router = useRouter();

  const [userName, setUserName] = useState("");
  const [user, loader] = useAuthState(auth);
  const [chats, setChats] = useState<any[]>([]);

  useEffect(() => {
    if (!loader && user?.email) {
      const unsubscribe = getChats(user.email, (chatData) => {
        console.log(chatData);
        setChats(chatData);
      });

      return () => unsubscribe();
    }
  }, [user, loader]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user && !loader) {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router, loader]);
  // useEffect(() => {
  //   const setupChatListener = async () => {
  //     if (!loader && user?.email) {
  //       const unsubscribe = await getChats(user.email, (chatData) => {
  //         console.log("Updated Chat List:", chatData);
  //         setChats(chatData);
  //       });
  //       return unsubscribe;
  //     }
  //   };
  //   const subscriptionPromise = setupChatListener();

  //   return () => {
  //     subscriptionPromise.then((unsubscribe) => {
  //       if (unsubscribe) unsubscribe();
  //     });
  //   };
  // }, [user, loader]);

  // useEffect(() => {
  //   const setupSubscription = async () => {
  //     if (!loader && user?.email) {
  //       const unsubscribe = getChats(user.email, (chatData) => {
  //         console.log("Chat Data Received:", chatData);
  //         setChats(chatData);
  //       });

  //       return unsubscribe;
  //     }
  //   };

  //   const subscriptionPromise = setupSubscription();

  //   return () => {
  //     subscriptionPromise.then((unsubscribe) => {
  //       if (unsubscribe) unsubscribe();
  //     });
  //   };
  // }, [user, loader]);

  if (loader)
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        Loading...
      </div>
    );

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-black text-white w-screen flex justify-center items-center">
        {user ? (
          <div className="min-h-screen mt-20">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (user?.email) makeChat(user.email, userName);
              }}
              className="flex gap-2 justify-center items-center"
            >
              <input
                placeholder="start chat with"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-black text-white border-white border-2 rounded-md p-2 outline-none"
              />
              <Button
                type="submit"
                className="bg-white hover:bg-gray-400 text-black p-2"
              >
                <UserPlus className="w-4 h-4 mr-2" /> start
              </Button>
            </form>
            <div className="mt-10 flex flex-col gap-5">
              {chats.map((msg, i) => (
                <Link
                  href={"/chat/" + msg.id}
                  key={msg.id}
                  className="flex items-start gap-4 group hover:bg-[#2e3035] -mx-4 px-4 py-1 transition-colors"
                >
                  <Avatar className="w-10 h-10 mt-1">
                    <AvatarImage src={msg.photoURL} />
                    <AvatarFallback className="bg-indigo-500 text-white">
                      {msg.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white hover:underline cursor-pointer">
                        {msg.username}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {msg.timestamp?.toDate().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-[#dbdee1] leading-relaxed">
                      {msg.message}
                    </p>
                  </div>
                </Link>

                // <div className="p-2 border-2 border-white" key={i}>
                //   <Link href={"/chat/" + msg.id} className="text-muted">
                //     {msg.id}
                //   </Link>
                //   <p> {msg.lastMessage}</p>
                // </div>
              ))}
            </div>
          </div>
        ) : (
          <div>bruh</div>
        )}
      </div>
    </>
  );
}
