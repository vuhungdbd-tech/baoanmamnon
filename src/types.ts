export * from './types/index';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  status?: "online" | "offline";
  bio?: string;
  lastSeen?: string;
}

export interface Friendship {
  id: string; // usually combination of user1Id and user2Id alphabetically
  user1Id: string;
  user2Id: string;
  status: "pending" | "accepted";
  createdAt?: string;
}

export interface ChatRoom {
  chatId: string;
  type: "direct" | "group";
  lastMessageText?: string;
  lastMessageTime?: any;
  lastSenderId?: string;
  updatedAt?: any;
}

export interface ChatMember {
  userId: string;
  joinedAt?: any;
}

export interface Message {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  type: "text" | "image" | "emoji" | "call_status";
  fileUrl?: string;
  isAiAsked?: boolean;
  timestamp: any;
}

export interface CallSession {
  callId: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  type: "audio" | "video";
  status: "ringing" | "accepted" | "rejected" | "ended";
  offer?: string;
  answer?: string;
  createdAt: any;
}

export interface IceCandidate {
  id?: string;
  candidate: string; // JSON string
  sdpMid: string;
  sdpMLineIndex: number;
  sender: "caller" | "receiver";
  createdAt: any;
}
