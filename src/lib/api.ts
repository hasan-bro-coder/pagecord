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
  QuerySnapshot,
  DocumentData,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

// Types
interface UserData {
  username: string;
  email: string;
  photoURL: string;
}

interface ChatData {
  members: string[];
  createdAt: any;
  lastMessage: string;
  lastUpdated: any;
}

interface MessageData {
  id: string,
  senderName: string;
  senderPhoto: string;
  text: string;
  timestamp: any;
  isEdited?: boolean;
  mediaUrl?: string;
  mediaId?: string;
}

interface MessageSender {
  name: string;
  photo: string;
}

interface MediaData extends MessageSender {
  mediaUrl: string;
  mediaId: string;
}

interface CloudinaryUploadResponse {
  url: string;
  type: string;
  publicId: string;
}

interface ChatListItem {
  id: string;
  message: string;
  timestamp: any;
  username: string;
  email: string;
  photoURL: string;
}

/**
 * Fetches a username from Firestore by email address
 * @param email - User's email address
 * @returns Username or null if not found
 */
export async function getUsernameByEmail(email: string): Promise<string | null> {
  if (!email) {
    console.error("Email is required");
    return null;
  }

  try {
    const usersQuery = query(
      collection(db, "users"),
      where("email", "==", email)
    );
    const querySnapshot = await getDocs(usersQuery);

    if (querySnapshot.empty) {
      console.log("No user found with email:", email);
      return null;
    }

    const userData = querySnapshot.docs[0].data() as UserData;
    return userData.username;
  } catch (error) {
    console.error("Error fetching username:", error);
    return null;
  }
}

/**
 * Creates or retrieves a chat between two users
 * @param currentUserEmail - Email of the current user
 * @param targetUsername - Username of the user to chat with
 * @returns Chat ID (channel name) or null if failed
 */
export async function createOrGetChat(
  currentUserEmail: string,
  targetUsername: string
): Promise<string | null> {
  if (!currentUserEmail || !targetUsername) {
    console.error("Both current user email and target username are required");
    return null;
  }

  try {
    // Find target user by username
    const targetUserQuery = query(
      collection(db, "users"),
      where("username", "==", targetUsername)
    );
    const targetUserSnapshot = await getDocs(targetUserQuery);

    if (targetUserSnapshot.empty) {
      console.error("Target user not found:", targetUsername);
      return null;
    }

    const targetUserData = targetUserSnapshot.docs[0].data() as UserData;
    const targetUserEmail = targetUserData.email;

    // Prevent chatting with self
    if (currentUserEmail === targetUserEmail) {
      console.error("Cannot create chat with yourself");
      return null;
    }

    // Get current user's username
    const currentUsername = await getUsernameByEmail(currentUserEmail);
    if (!currentUsername) {
      console.error("Current user not found");
      return null;
    }

    // Create consistent chat ID by sorting usernames
    const chatId = [currentUsername, targetUsername].sort().join("_");

    // Create or update chat document
    const chatRef = doc(db, "chats", chatId);
    await setDoc(
      chatRef,
      {
        members: [currentUserEmail, targetUserEmail].sort(),
        createdAt: serverTimestamp(),
        lastMessage: "",
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );

    return chatId;
  } catch (error) {
    console.error("Error creating chat:", error);
    return null;
  }
}

/**
 * Sends a text message in a chat
 * @param chatId - ID of the chat
 * @param text - Message text content
 * @param sender - Sender information (name and photo)
 */
export async function sendMessage(
  chatId: string,
  text: string,
  sender: MessageSender
): Promise<void> {
  if (!chatId || !text.trim() || !sender.name) {
    console.error("Invalid message parameters");
    return;
  }

  try {
    const messagesRef = collection(db, "chats", chatId, "messages");
    
    await addDoc(messagesRef, {
      senderName: sender.name,
      senderPhoto: sender.photo,
      text: text.trim(),
      timestamp: serverTimestamp(),
    });

    // Update chat metadata
    const chatRef = doc(db, "chats", chatId);
    await setDoc(
      chatRef,
      {
        lastMessage: text.trim().substring(0, 100), // Limit preview length
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}

/**
 * Sends a message with media attachment
 * @param chatId - ID of the chat
 * @param text - Optional message text
 * @param mediaData - Media and sender information
 */
export async function sendMessageWithMedia(
  chatId: string,
  text: string,
  mediaData: MediaData
): Promise<void> {
  if (!chatId || !mediaData.mediaUrl || !mediaData.name) {
    console.error("Invalid media message parameters");
    return;
  }

  try {
    const messagesRef = collection(db, "chats", chatId, "messages");
    
    await addDoc(messagesRef, {
      senderName: mediaData.name,
      senderPhoto: mediaData.photo,
      text: text.trim(),
      mediaUrl: mediaData.mediaUrl,
      mediaId: mediaData.mediaId,
      timestamp: serverTimestamp(),
    });

    // Update chat metadata
    const chatRef = doc(db, "chats", chatId);
    await setDoc(
      chatRef,
      {
        lastMessage: text.trim() || "📎 Sent an attachment",
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error sending media message:", error);
    throw error;
  }
}

/**
 * Subscribe to real-time messages in a chat
 * @param chatId - ID of the chat
 * @param callback - Function to call with updated messages
 * @returns Unsubscribe function
 */
export function subscribeToMessages(
  chatId: string,
  callback: (messages: MessageData[]) => void
): Unsubscribe {
  if (!chatId) {
    console.error("Chat ID is required");
    return () => {};
  }

  const messagesRef = collection(db, "chats", chatId, "messages");
  const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

  return onSnapshot(
    messagesQuery,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const messages = snapshot.docs.map((doc) => ({
        ...doc.data(),
      })) as MessageData[];
      
      callback(messages);
    },
    (error) => {
      console.error("Error subscribing to messages:", error);
    }
  );
}

/**
 * Subscribe to user's chat list
 * @param userEmail - Email of the current user
 * @param callback - Function to call with updated chat list
 * @returns Unsubscribe function
 */
export function subscribeToChats(
  userEmail: string,
  callback: (chats: ChatListItem[]) => void
): Unsubscribe {
  if (!userEmail) {
    console.error("User email is required");
    return () => {};
  }

  const chatsRef = collection(db, "chats");
  const chatsQuery = query(
    chatsRef,
    where("members", "array-contains", userEmail),
    orderBy("lastUpdated", "desc")
  );

  return onSnapshot(
    chatsQuery,
    async (snapshot: QuerySnapshot<DocumentData>) => {
      const chatDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as (ChatData & { id: string })[];

      // Fetch other user's details for each chat
      const chatListPromises = chatDocs.map(async (chat) => {
        const otherUserEmail = chat.members.find((email) => email !== userEmail);

        if (!otherUserEmail) {
          return null;
        }

        const userQuery = query(
          collection(db, "users"),
          where("email", "==", otherUserEmail)
        );
        const userSnapshot = await getDocs(userQuery);

        if (userSnapshot.empty) {
          return null;
        }

        const otherUserData = userSnapshot.docs[0].data() as UserData;

        return {
          id: chat.id,
          message: chat.lastMessage,
          timestamp: chat.lastUpdated,
          username: otherUserData.username,
          email: otherUserData.email,
          photoURL: otherUserData.photoURL,
        } as ChatListItem;
      });

      const resolvedChats = await Promise.all(chatListPromises);
      const validChats = resolvedChats.filter(
        (chat): chat is ChatListItem => chat !== null
      );

      callback(validChats);
    },
    (error) => {
      console.error("Error subscribing to chats:", error);
    }
  );
}

/**
 * Extracts the other user's name from a chat ID
 * @param chatId - Chat ID in format "user1_user2"
 * @param currentUsername - Current user's username
 * @returns Other user's username or null
 */
export function getOtherUsername(
  chatId: string,
  currentUsername: string
): string | null {
  if (!chatId || !currentUsername) {
    return null;
  }

  const participants = chatId.split("_");
  
  if (participants.length !== 2) {
    console.error("Invalid chat ID format:", chatId);
    return null;
  }

  const otherUser = participants.find((username) => username !== currentUsername);
  return otherUser || participants[0];
}

/**
 * Uploads a file to Cloudinary
 * @param file - File to upload
 * @returns Upload response with URL and metadata
 */
export async function uploadToCloudinary(
  file: File
): Promise<CloudinaryUploadResponse> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "pagecord-images";

  if (!cloudName) {
    throw new Error("Cloudinary cloud name is not configured");
  }

  // Validate file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error("File size exceeds 10MB limit");
  }

  // Validate file type
  const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type. Only images and videos are allowed");
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Upload failed");
    }

    const data = await response.json();

    return {
      url: data.secure_url || data.url,
      type: data.resource_type,
      publicId: data.public_id,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
}

// Legacy exports for backward compatibility
export const getUserName = getUsernameByEmail;
export const makeChat = createOrGetChat;
export const sendFile = sendMessageWithMedia;
export const getChats = subscribeToChats;
export const getOtherUser = getOtherUsername;

// import {
//   collection,
//   addDoc,
//   doc,
//   query,
//   where,
//   getDocs,
//   serverTimestamp,
//   setDoc,
//   onSnapshot,
//   orderBy,
// } from "firebase/firestore";
// import { db } from "./firebase";

// export async function getUserName(email: string): Promise<string> {
//   try {
//     const q = query(collection(db, "users"), where("email", "==", email));
//     const userSnap = await getDocs(q);

//     // 1. Check if the snapshot is empty before accessing docs
//     if (userSnap.empty) {
//       console.log("No user found with that email.");
//       return "null";
//     }

//     // 2. Use .data() to get the fields from the first document
//     const userData = userSnap.docs[0].data();

//     console.log("username found:", userData.username);
//     return userData.username;
//   } catch (error) {
//     console.error("Error fetching username:", error);
//     return "null";
//   }
// }

// export const makeChat = async (
//   currentEmail: string,
//   targetUserName: string,
// ) => {
//   const userQuery = query(
//     collection(db, "users"),
//     where("username", "==", targetUserName),
//   );
//   const userSnap = await getDocs(userQuery);
//   if (userSnap.empty) return;
//   let targetEmail = userSnap.docs[0].data().email;
//   const channelName = [await getUserName(currentEmail), targetUserName]
//     .sort()
//     .join("_");
//   console.log(userQuery, userSnap, targetUserName, channelName);
//   const chatRef = doc(db, "chats", channelName);
//   await setDoc(
//     chatRef,
//     {
//       members: [currentEmail, targetEmail],
//       createdAt: serverTimestamp(),
//       lastMessage: "",
//       lastUpdated: serverTimestamp(),
//     },
//     { merge: true },
//   );

//   return channelName;
// };

// export const sendMessage = async (
//   channelName: string,
//   text: string,
//   data: { name: string; photo: string },
// ) => {
//   if (!text.trim()) return;
//   const messagesRef = collection(db, "chats", channelName, "messages");
//   await addDoc(messagesRef, {
//     senderName: data.name,
//     senderPhoto: data.photo,
//     text: text,
//     timestamp: serverTimestamp(),
//   });
//   const chatRef = doc(db, "chats", channelName);
//   await setDoc(
//     chatRef,
//     {
//       lastMessage: text,
//       lastUpdated: serverTimestamp(),
//     },
//     { merge: true },
//   );
// };

// export const subscribeToMessages = (
//   channelName: string,
//   callback: (messages: any[]) => void,
// ) => {
//   const messagesRef = collection(db, "chats", channelName, "messages");
//   const q = query(messagesRef, orderBy("timestamp", "asc"));
//   return onSnapshot(q, (snapshot) => {
//     const messages = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));
//     callback(messages);
//   });
// };

// export const sendFile = async (
//   channelName: string,
//   text: string,
//   data: { name: string; photo: string; mediaUrl: string; mediaId: string },
// ) => {
//   const messagesRef = collection(db, "chats", channelName, "messages");
//   await addDoc(messagesRef, {
//     senderName: data.name,
//     senderPhoto: data.photo,
//     text: text,
//     mediaUrl: data.mediaUrl,
//     mediaId: data.mediaId,
//     timestamp: serverTimestamp(),
//   });
//   const chatRef = doc(db, "chats", channelName);
//   await setDoc(
//     chatRef,
//     {
//       lastMessage: "sent a file",
//       lastUpdated: serverTimestamp(),
//     },
//     { merge: true },
//   );

// };

// export function getChats(
//   userEmail: string,
//   callback: (messages: any[]) => void,
// ) {
//   const chatsRef = collection(db, "chats");
//   const q = query(
//     chatsRef,
//     where("members", "array-contains", userEmail),
//     orderBy("lastUpdated", "desc"),
//   );

//   return onSnapshot(q, async (snapshot) => {
//     const chatDocs = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     const dataPromises = chatDocs.map(async (chat: any) => {
//       const otherMemberEmail = chat.members.find(
//         (mail: string) => mail !== userEmail,
//       );

//       const userQ = query(
//         collection(db, "users"),
//         where("email", "==", otherMemberEmail),
//       );

//       const userSnap = await getDocs(userQ);

//       if (userSnap.empty) {
//         return { ...chat, otherUser: null };
//       }

//       const userData = userSnap.docs[0].data();
//       return {
//         id: chat.id,
//         message: chat.lastMessage,
//         timestamp: chat.lastUpdated,
//         ...userData,
//       };
//     });

//     // 2. WAIT for all user data to be fetched
//     const finalizedChats = await Promise.all(dataPromises);

//     // 3. Send the actual data to React
//     callback(finalizedChats);
//   });
// }

// export function getOtherUser(chatId: string, currentUserId: string): string | null {
//   if (!chatId || !currentUserId) return null;
//   const participants = chatId.split("_");
//   const otherUser = participants.find((id) => id !== currentUserId);
//   return otherUser || participants[0]; 
// }


// export const uploadToCloudinary = async (file: File) => {
//   const formData = new FormData();
//   formData.append("file", file);
//   const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
//   formData.append("upload_preset", "pagecord-images"); // Replace this!
//   console.log(formData);
  

//   const response = await fetch(
//     `https://api.cloudinary.com/v1_1/${cloudName}/upload`,
//     {
//       method: "POST",
//       body: formData,
//     },
//   );

//   if (!response.ok) throw new Error("Upload failed");

//   const data = await response.json();
//   console.log(data);
  
//   return {
//     url: data.url,
//     type: data.resource_type, // 'image' or 'video'
//     publicId: data.public_id,
//   };
// };
