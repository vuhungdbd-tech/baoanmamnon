import React, { useState, useEffect } from "react";
import { UserProfile, Friendship } from "../types";
import { 
  collection, 
  query, 
  getDocs, 
  where, 
  setDoc, 
  doc, 
  addDoc 
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase";
import { Search, UserPlus, MessageSquare, ShieldCheck, Heart, User } from "lucide-react";

interface FriendsTabProps {
  currentUser: UserProfile;
  friends: UserProfile[];
  onStartChat: (friend: UserProfile) => void;
  onFriendAdded?: () => void;
  // Fallbacks for simulated state
  simulatedUsers?: UserProfile[];
  onSimulateAddFriend?: (friend: UserProfile) => void;
}

export default function FriendsTab({ 
  currentUser, 
  friends, 
  onStartChat, 
  onFriendAdded,
  simulatedUsers = [],
  onSimulateAddFriend
}: FriendsTabProps) {
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setSearchResults([]);

    if (!searchEmail.trim()) {
      setErrorMessage("Vui lòng nhập tên hoặc email để tìm kiếm.");
      return;
    }

    setSearching(true);

    // Simulated search mode
    if (!isFirebaseConfigured || currentUser.uid.startsWith("simulated_")) {
      setTimeout(() => {
        const queryTerm = searchEmail.toLowerCase().trim();
        const found = simulatedUsers.filter(u => 
          u.uid !== currentUser.uid &&
          (u.email.toLowerCase().includes(queryTerm) || 
           u.displayName.toLowerCase().includes(queryTerm))
        );
        
        if (found.length === 0) {
          setErrorMessage("Không tìm thấy người dùng phù hợp ở chế độ mô phỏng.");
        } else {
          setSearchResults(found);
        }
        setSearching(false);
      }, 500);
      return;
    }

    // Real Firebase Search mode
    try {
      const q = query(
        collection(db, "users"), 
        where("email", "==", searchEmail.trim())
      );
      const querySnap = await getDocs(q);
      const results: UserProfile[] = [];
      querySnap.forEach((doc) => {
        const u = doc.data() as UserProfile;
        if (u.uid !== currentUser.uid) {
          results.push(u);
        }
      });

      if (results.length === 0) {
        // Fallback: try name search via collection scan (case insensitive is tough in Firestore indexing, so we do client-side filter or name exact match)
        const nameQ = query(collection(db, "users"), where("displayName", "==", searchEmail.trim()));
        const nameSnap = await getDocs(nameQ);
        nameSnap.forEach((doc) => {
          const u = doc.data() as UserProfile;
          if (u.uid !== currentUser.uid && !results.some(r => r.uid === u.uid)) {
            results.push(u);
          }
        });
      }

      if (results.length === 0) {
        setErrorMessage("Không tìm thấy người dùng có Email hoặc Tên chính xác này.");
      } else {
        setSearchResults(results);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Đã xảy ra lỗi khi tìm kiếm người dùng.");
    } finally {
      setSearching(false);
    }
  };

  const handleAddFriend = async (targetUser: UserProfile) => {
    setErrorMessage("");
    setSuccessMessage("");

    // Check if already friends
    if (friends.some(f => f.uid === targetUser.uid)) {
      setErrorMessage(`Bạn và ${targetUser.displayName} đã là bạn bè.`);
      return;
    }

    // Simulated add friend
    if (!isFirebaseConfigured || currentUser.uid.startsWith("simulated_")) {
      if (onSimulateAddFriend) {
        onSimulateAddFriend(targetUser);
        setSuccessMessage(`Đã kết bạn thành công với ${targetUser.displayName}!`);
        setSearchResults([]);
        setSearchEmail("");
      }
      return;
    }

    // Real Firebase Add Friend
    try {
      const friendshipId = [currentUser.uid, targetUser.uid].sort().join("_");
      const friendship: Friendship = {
        id: friendshipId,
        user1Id: currentUser.uid,
        user2Id: targetUser.uid,
        status: "accepted", // Autoaccepting for easy UX
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "friendships", friendshipId), friendship);
      setSuccessMessage(`Đã kết bạn thành công với ${targetUser.displayName}!`);
      setSearchResults([]);
      setSearchEmail("");
      if (onFriendAdded) onFriendAdded();
    } catch (err) {
      console.error(err);
      setErrorMessage("Không thể thực hiện kết bạn. Lỗi bảo mật Firestore.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Title */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Thêm bạn mới</h4>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
          {friends.length} Bạn bè
        </span>
      </div>

      {/* Friend Add Form */}
      <div className="p-4 border-b border-slate-100">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              id="friend-search-input"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="Nhập Email hoặc Tên đầy đủ..."
              className="pl-9 pr-3 py-2 w-full text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            id="friend-search-btn"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2 rounded-xl transition duration-150 shadow-xs flex items-center shrink-0"
          >
            {searching ? "Đang tìm..." : "Tìm"}
          </button>
        </form>

        {errorMessage && (
          <p className="mt-2 text-xs text-red-600 font-medium">{errorMessage}</p>
        )}
        {successMessage && (
          <p className="mt-2 text-xs text-emerald-600 font-bold">{successMessage}</p>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50/55 rounded-2xl border border-blue-100 space-y-3">
            <p className="text-xs font-bold text-blue-800">Kết quả tìm kiếm:</p>
            {searchResults.map((result) => (
              <div key={result.uid} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-100">
                <div className="flex items-center space-x-3">
                  <img
                    src={result.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}
                    alt={result.displayName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div>
                    <h5 className="text-sm font-bold text-slate-800 leading-tight">{result.displayName}</h5>
                    <p className="text-xs text-slate-500 leading-tight">{result.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleAddFriend(result)}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-xl transition shadow-xs flex items-center space-x-1"
                  title="Kết bạn"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends List Workspace */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <p className="text-xs font-semibold text-slate-400 px-3 py-1 uppercase tracking-wider">Danh sách bạn bè</p>
        
        {friends.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-400">
            <User className="w-12 h-12 mx-auto stroke-[1.2] text-slate-300 mb-2" />
            <p className="text-sm font-semibold">Chưa có bạn bè trong danh sách</p>
            <p className="text-xs max-w-xs mx-auto mt-1">Hãy nhập email hoặc tên của thành viên khác ở trên để tìm và kết bạn!</p>
          </div>
        ) : (
          friends.map((friend) => (
            <div
              key={friend.uid}
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition duration-150 cursor-pointer border border-transparent hover:border-slate-100 group"
              onClick={() => onStartChat(friend)}
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <img
                    src={friend.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}
                    alt={friend.displayName}
                    className="w-11 h-11 rounded-full object-cover"
                  />
                  {friend.status === "online" ? (
                    <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white bg-emerald-500" title="Trực tuyến" />
                  ) : (
                    <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white bg-slate-300" title="Ngoại tuyến" />
                  )}
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-800 leading-tight group-hover:text-blue-600 transition">{friend.displayName}</h5>
                  <p className="text-xs text-slate-500 truncate max-w-[160px] leading-tight mt-0.5">{friend.bio || "Không có lời giới thiệu"}</p>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartChat(friend);
                }}
                className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition duration-150"
                title="Nhắn tin"
              >
                <MessageSquare className="w-4 h-4 fill-current" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
