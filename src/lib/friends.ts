import {
  collection,
  addDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
  setDoc,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";

export async function getUserName(email: string): Promise<string> {
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const userSnap = await getDocs(q);

    // 1. Check if the snapshot is empty before accessing docs
    if (userSnap.empty) {
      console.log("No user found with that email.");
      return "null";
    }

    // 2. Use .data() to get the fields from the first document
    const userData = userSnap.docs[0].data();

    console.log("username found:", userData.username);
    return userData.username;
  } catch (error) {
    console.error("Error fetching username:", error);
    return "null";
  }
}

export const makeChat = async (
  currentEmail: string,
  targetUserName: string,
) => {
  const userQuery = query(
    collection(db, "users"),
    where("username", "==", targetUserName),
  );
  const userSnap = await getDocs(userQuery);
  if (userSnap.empty) return;
  let targetEmail = userSnap.docs[0].data().email;
  const channelName = [await getUserName(currentEmail), targetUserName].sort().join("_");
  console.log(userQuery, userSnap, targetUserName, channelName);
  const chatRef = doc(db, "chats", channelName);
  await setDoc(
    chatRef,
    {
      members: [currentEmail, targetEmail],
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastUpdated: serverTimestamp(),
    },
    { merge: true },
  );

  return channelName;
};

export const sendMessage = async (
  channelName: string,
  text: string,
  data: { name: string; photo: string },
) => {
  if (!text.trim()) return;
  const messagesRef = collection(db, "chats", channelName, "messages");
  await addDoc(messagesRef, {
    senderName: data.name,
    senderPhoto: data.photo,
    text: text,
    timestamp: serverTimestamp(),
  });
  const chatRef = doc(db, "chats", channelName);
  await setDoc(
    chatRef,
    {
      lastMessage: text,
      lastUpdated: serverTimestamp(),
    },
    { merge: true },
  );
};

export const subscribeToMessages = (
  channelName: string,
  callback: (messages: any[]) => void,
) => {
  const messagesRef = collection(db, "chats", channelName, "messages");
  const q = query(messagesRef, orderBy("timestamp", "asc"));
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(messages);
  });
};

export function getChats(
  userEmail: string,
  callback: (messages: any[]) => void
) {
  const chatsRef = collection(db, "chats");
  const q = query(
    chatsRef,
    where("members", "array-contains", userEmail),
    orderBy("lastUpdated", "desc")
  );

  return onSnapshot(q, async (snapshot) => {
    const chatDocs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const dataPromises = chatDocs.map(async (chat: any) => {
      const otherMemberEmail = chat.members.find((mail: string) => mail !== userEmail);
      
      const userQ = query(
        collection(db, "users"),
        where("email", "==", otherMemberEmail)
      );
      
      const userSnap = await getDocs(userQ);
      
      if (userSnap.empty) {
        return { ...chat, otherUser: null };
      }

      const userData = userSnap.docs[0].data();
      return { id: chat.id ,message: chat.lastMessage,timestamp: chat.lastUpdated, ...userData };
    });

    // 2. WAIT for all user data to be fetched
    const finalizedChats = await Promise.all(dataPromises);

    // 3. Send the actual data to React
    callback(finalizedChats);
  });
}
