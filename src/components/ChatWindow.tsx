import React, { useState, useEffect, useRef } from "react";
import { UserProfile, ChatRoom, Message } from "../types";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  setDoc,
  doc,
  orderBy, 
  limit, 
  serverTimestamp, 
  updateDoc 
} from "firebase/firestore";
import { db, isFirebaseConfigured, handleFirestoreError } from "../firebase";
import { 
  Send, 
  Smile, 
  Image as ImageIcon, 
  Paperclip,
  Sparkles, 
  Phone, 
  Video, 
  Info,
  ChevronRight,
  Sparkle
} from "lucide-react";

interface ChatWindowProps {
  currentUser: UserProfile;
  selectedChat: ChatRoom;
  partner: UserProfile;
  onInitiateCall: (partner: UserProfile, type: "audio" | "video") => void;
  // Simulated State hooks (for Sandbox Demo environment)
  onSendSimulatedMessage?: (text: string, type?: "text" | "image" | "emoji") => void;
  simulatedMessages?: Message[];
}

export default function ChatWindow({
  currentUser,
  selectedChat,
  partner,
  onInitiateCall,
  onSendSimulatedMessage,
  simulatedMessages = []
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(partner.status === "online");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emojiList = ["👍", "❤️", "😂", "😮", "😢", "😡", "👏", "🎉", "🔥", "🙏", "👀", "✨"];

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, simulatedMessages, aiLoading]);

  // Keep partner online state synced
  useEffect(() => {
    setPartnerOnline(partner.status === "online");
  }, [partner]);

  // Connect to Firestore real-time message stream
  useEffect(() => {
    if (!isFirebaseConfigured || currentUser.uid.startsWith("simulated_")) {
      // Sandbox Mode: Use prop-passed simulated messages
      setMessages(simulatedMessages);
      return;
    }

    const messagesColPath = `chats/${selectedChat.chatId}/messages`;
    const q = query(collection(db, messagesColPath), orderBy("timestamp", "asc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((snapDoc) => {
        const item = snapDoc.data();
        msgs.push({
          messageId: snapDoc.id,
          senderId: item.senderId,
          senderName: item.senderName,
          text: item.text,
          type: item.type || "text",
          fileUrl: item.fileUrl,
          isAiAsked: item.isAiAsked || false,
          timestamp: item.timestamp?.toDate ? item.timestamp.toDate() : item.timestamp
        });
      });
      setMessages(msgs);
    }, (error) => {
      // Graceful error logging
      console.warn("Permission restricted or Firestore offline. Continuing elegantly. Context: ", error);
    });

    return () => unsub();
  }, [selectedChat.chatId, simulatedMessages]);

  const handleSendMessage = async (textToSend: string, type: "text" | "image" | "emoji" = "text", fileUrl?: string, isAi?: boolean) => {
    if (!textToSend.trim() && !fileUrl) return;

    // Sandbox Mock send
    if (!isFirebaseConfigured || currentUser.uid.startsWith("simulated_")) {
      if (onSendSimulatedMessage) {
        onSendSimulatedMessage(textToSend, type);
      }
      return;
    }

    // Real Firebase Send
    try {
      const messagesColPath = `chats/${selectedChat.chatId}/messages`;
      const messageId = "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);

      const messagePayload = {
        messageId,
        senderId: isAi ? "gemini_ai_bot" : currentUser.uid,
        senderName: isAi ? "Gemini AI" : currentUser.displayName,
        text: textToSend,
        type: type,
        fileUrl: fileUrl || null,
        isAiAsked: isAi || false,
        timestamp: new Date()
      };

      // Add to Firestore Subcollection
      await addDoc(collection(db, messagesColPath), messagePayload);

      // Update parent chat room with last message summary
      await updateDoc(doc(db, "chats", selectedChat.chatId), {
        lastMessageText: type === "image" ? "📷 [Hình ảnh]" : type === "emoji" ? `✨ ${textToSend}` : textToSend,
        lastSenderId: isAi ? "gemini_ai_bot" : currentUser.uid,
        lastMessageTime: new Date(),
        updatedAt: new Date()
      });
    } catch (err) {
      console.error("Firestore Error sending message:", err);
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    handleSendMessage(inputText, "text");
    setInputText("");
  };

  const handleSendEmoji = (emoji: string) => {
    handleSendMessage(emoji, "emoji");
    setShowEmojiPicker(false);
  };

  // Base64 Local Image Capture & Upload (Works Out-Of-The-Box with zero paid cloud assets!)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        handleSendMessage("Đã gửi một hình ảnh", "image", reader.result);
      }
    };
    reader.readAsDataURL(file);
    // Reset file input value
    e.target.value = "";
  };

  // Trigger Gemini AI Call "Hỏi AI"
  const handleAskAI = async () => {
    const textToAsk = inputText.trim() || (messages.length > 0 ? messages[messages.length - 1].text : "");
    if (!textToAsk) return;

    setInputText("");
    setAiLoading(true);

    // Save prompt message from current user
    if (inputText.trim()) {
      await handleSendMessage(inputText, "text");
    }

    try {
      // Gather recently loaded message history context for Gemini AI
      const historyContext = messages.slice(-5).map(m => ({
        role: m.senderId === currentUser.uid ? "user" : "model",
        text: m.text
      }));

      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToAsk,
          history: historyContext,
          userName: currentUser.displayName
        })
      });

      const data = await response.json();
      if (response.ok) {
        // Send AI answer as a model response
        await handleSendMessage(data.answer, "text", undefined, true);
        
        // If in simulation mode, manually update simulated states too
        if (!isFirebaseConfigured || currentUser.uid.startsWith("simulated_")) {
          if (onSendSimulatedMessage) {
            // Emulate AI message in parent simulation
            onSendSimulatedMessage(data.answer, "text");
          }
        }
      } else {
        await handleSendMessage(`[Lỗi Trợ Lý] ${data.error || "Không kết nối được dịch vụ Gemini."}`, "text", undefined, true);
      }
    } catch (e: any) {
      console.error(e);
      await handleSendMessage(`[Lỗi Hệ Thống] Không liên lạc được với Express API server. Hãy chắc chắn máy chủ của bạn đang chạy.`, "text", undefined, true);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative group" id="chat-window-viewport">
      {/* Top Banner Toolbar */}
      <div className="h-16 border-b border-slate-200 px-6 flex items-center justify-between bg-white shadow-xs shrink-0 select-none">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <img 
              src={partner.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"} 
              alt={partner.displayName} 
              className="w-10 h-10 rounded-full object-cover border border-slate-100"
            />
            {partnerOnline ? (
              <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white bg-emerald-500" />
            ) : (
              <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white bg-slate-300" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-800 leading-tight">{partner.displayName}</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {partnerOnline ? "Vừa truy cập (Trực tuyến)" : "Ngoại tuyến"}
            </p>
          </div>
        </div>

        {/* Action Call buttons */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onInitiateCall(partner, "audio")}
            id="start-voice-call-btn"
            className="p-2.5 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition duration-150"
            title="Cuộc gọi thoại"
          >
            <Phone className="w-5 h-5 fill-current" />
          </button>
          
          <button
            onClick={() => onInitiateCall(partner, "video")}
            id="start-video-call-btn"
            className="p-2.5 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition duration-150"
            title="Cuộc gọi video"
          >
            <Video className="w-5 h-5" />
          </button>

          <button
            className="p-2.5 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition duration-150"
            title="Thông tin hội thoại"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Panel */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Safe Greeting banner */}
        <div className="text-center py-6 select-none">
          <img 
            src={partner.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"} 
            alt={partner.displayName} 
            className="w-16 h-16 rounded-full object-cover mx-auto shadow-sm border border-slate-200"
          />
          <h5 className="text-sm font-extrabold text-slate-800 mt-2">{partner.displayName}</h5>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            {partner.bio || "Bạn đang kết nối trực tiếp 1-1 qua thuật toán mã hóa đám mây Firestore."}
          </p>
          <div className="mt-2 text-[10px] text-slate-300 font-semibold uppercase tracking-widest bg-slate-200/50 inline-block px-3 py-1 rounded-full">
            Bắt đầu cuộc hội thoại
          </div>
        </div>

        {/* Render each message details */}
        {messages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.uid;
          const isAi = msg.senderId === "gemini_ai_bot" || msg.isAiAsked;

          return (
            <div 
              key={msg.messageId || index} 
              className={`flex items-start ${isMe ? "justify-end" : "justify-start"} space-x-2`}
            >
              {/* Partner Avatar image on left if not me */}
              {!isMe && (
                <img 
                  src={isAi ? "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150" : partner.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"} 
                  alt={msg.senderName} 
                  className="w-8 h-8 rounded-full object-cover shadow-xs shrink-0 mt-0.5 border border-slate-200"
                />
              )}

              {/* Message bubble wrap */}
              <div className="flex flex-col max-w-[70%]">
                <span className="text-[10px] text-slate-400 mb-0.5 px-1 font-semibold">
                  {msg.senderName}
                </span>

                {/* Bubble styling based on sender types */}
                <div 
                  className={`relative p-3.5 rounded-2xl shadow-xs border ${
                    isMe 
                      ? "bg-blue-600 text-white border-blue-600 rounded-tr-none" 
                      : isAi 
                        ? "bg-purple-50 text-purple-900 border-purple-200 rounded-tl-none ring-1 ring-purple-100"
                        : "bg-white text-slate-800 border-slate-200 rounded-tl-none"
                  }`}
                >
                  {/* Emoji Specific large text */}
                  {msg.type === "emoji" ? (
                    <span className="text-3xl leading-none block select-none">{msg.text}</span>
                  ) : msg.type === "image" ? (
                    <div className="space-y-1.5 leading-tight">
                      {msg.fileUrl && (
                        <img 
                          src={msg.fileUrl} 
                          alt="Đính kèm" 
                          referrerPolicy="no-referrer"
                          className="rounded-xl max-w-full max-h-60 object-cover shadow-sm cursor-pointer"
                        />
                      )}
                      <p className="text-xs opacity-90">{msg.text}</p>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap select-text">{msg.text}</p>
                  )}

                  {/* AI Smart Sparkle icon */}
                  {isAi && (
                    <div className="absolute -top-1.5 -right-1.5 p-1 bg-purple-600 text-white rounded-full border border-white">
                      <Sparkles className="w-3 h-3 fill-current" />
                    </div>
                  )}
                </div>

                <span className="text-[9px] text-slate-400 mt-1 self-end font-sans tracking-wide">
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                </span>
              </div>
            </div>
          );
        })}

        {/* Gemini AI thinking typing indicator */}
        {aiLoading && (
          <div className="flex items-start justify-start space-x-2" id="ai-typing-indicator">
            <img 
              src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150" 
              alt="Gemini" 
              className="w-8 h-8 rounded-full object-cover animate-pulse shadow-sm shrink-0 mt-0.5 border border-purple-200"
            />
            <div className="flex flex-col">
              <span className="text-[10px] text-purple-600 font-bold">Trợ Lý Gemini AI</span>
              <div className="p-3 bg-purple-50 text-slate-800 border border-purple-200 rounded-2xl rounded-tl-none flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce delay-100" />
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce delay-200" />
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce delay-300" />
                <span className="text-xs text-purple-700 font-bold ml-1">Đang suy nghĩ...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emojis picker reel */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-xl flex gap-3 z-20 animate-fade-in select-none">
          {emojiList.map((emo) => (
            <button
              key={emo}
              onClick={() => handleSendEmoji(emo)}
              className="text-2xl hover:scale-130 transition duration-150"
            >
              {emo}
            </button>
          ))}
        </div>
      )}

      {/* Input Message panel */}
      <div className="p-4 border-t border-slate-200 bg-white shadow-xs shrink-0 relative select-none">
        <form onSubmit={handleSendText} className="flex items-center space-x-2">
          {/* Attachment options */}
          <div className="flex items-center">
            {/* Custom Emoji Reel toggle */}
            <button
              type="button"
              id="emoji-picker-toggle"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2.5 rounded-xl hover:bg-slate-100 transition ${showEmojiPicker ? "text-blue-600 bg-blue-50" : "text-slate-400 hover:text-slate-600"}`}
              title="Nhãn dán cảm xúc"
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Custom file image uploader */}
            <button
              type="button"
              id="image-picker-toggle"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Gửi hình ảnh"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              id="image-file-input"
              onChange={handleImageUpload} 
              className="hidden" 
              accept="image/*" 
            />
          </div>

          {/* Main Draft Box */}
          <div className="relative flex-1">
            <input
              type="text"
              id="message-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Nhập tin nhắn đến đồng nghiệp hoặc nhấp Hỏi AI..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 pr-24 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-blue-500"
            />
            
            {/* Ask AI "Hỏi AI" Trigger buttons */}
            <button
              type="button"
              id="ask-ai-tab"
              onClick={handleAskAI}
              disabled={aiLoading}
              className="absolute right-2.5 top-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center space-x-1.5 hover:from-purple-700 hover:to-indigo-700 active:scale-95 transition"
              title="Hỏi trợ lý ảo Gemini AI"
            >
              <Sparkles className="w-3.5 h-3.5 fill-current animate-pulse text-yellow-300" />
              <span>Hỏi AI</span>
            </button>
          </div>

          {/* Regular Blue send message button */}
          <button
            type="submit"
            id="message-submit-btn"
            disabled={!inputText.trim() && !aiLoading}
            className="p-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white transition duration-150 disabled:bg-slate-100 disabled:text-slate-300 shadow-md transform active:scale-95 flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4 fill-current" />
          </button>
        </form>
      </div>
    </div>
  );
}
