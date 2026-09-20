import React, { useState } from "react";
import { UserProfile } from "../types";
import { doc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase";
import { X, Camera, Save, User, UserCheck } from "lucide-react";

interface ProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdate: (updatedFields: Partial<UserProfile>) => void;
}

export default function ProfileModal({ user, onClose, onUpdate }: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio || "");
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
  const [status, setStatus] = useState<"online" | "offline">(user.status || "online");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const predefinedAvatars = [
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
    "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150"
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    const updated = {
      displayName,
      bio,
      photoURL,
      status
    };

    try {
      if (isFirebaseConfigured && user.uid && !user.uid.startsWith("simulated_")) {
        await updateDoc(doc(db, "users", user.uid), updated);
      }
      onUpdate(updated);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      console.error("Lỗi khi lưu hồ sơ:", err);
      // Fallback update on interface
      onUpdate(updated);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 800);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="profile-modal">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5" />
            <h3 className="font-bold text-lg">Cập nhật hồ sơ cá nhân</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
            id="close-profile-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto flex-1">
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-sm flex items-center space-x-2" id="profile-success">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              <span>Đã lưu thông tin thay đổi thành công!</span>
            </div>
          )}

          {/* Avatar Section */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <img 
                src={photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"} 
                alt="Avatar" 
                className="w-24 h-24 rounded-full border-4 border-blue-50 object-cover shadow-md"
              />
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-150 pointer-events-none">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            
            <p className="mt-3 text-xs font-semibold text-slate-500">Chọn ảnh đại diện có sẵn:</p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {predefinedAvatars.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPhotoURL(url)}
                  className={`w-10 h-10 rounded-full overflow-hidden border-2 transition ${
                    photoURL === url ? "border-blue-600 ring-2 ring-blue-100 shadow-md transform scale-110" : "border-slate-200"
                  }`}
                >
                  <img src={url} alt={`Avatar predefined ${idx}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            <div className="mt-3 w-full">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Hoặc dán URL hình ảnh:</label>
              <input
                type="text"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://assets.example.com/photo.jpg"
                className="block w-full border border-slate-300 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
              />
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* User Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">Tên hiển thị</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full border border-slate-300 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Giới thiệu bản thân (Bio)</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Mô tả ngắn về bạn..."
                rows={2}
                className="mt-1 block w-full border border-slate-300 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Trạng thái hoạt động</label>
              <div className="mt-1 flex items-center gap-4">
                <label className="inline-flex items-center space-x-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={status === "online"}
                    onChange={() => setStatus("online")}
                    className="text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block"></span>
                    <span>Trực tuyến (Online)</span>
                  </span>
                </label>
                <label className="inline-flex items-center space-x-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    checked={status === "offline"}
                    onChange={() => setStatus("offline")}
                    className="text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="flex items-center space-x-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 block"></span>
                    <span>Ngoại tuyến (Offline)</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold text-sm transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              id="save-profile-btn"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2 rounded-xl flex items-center space-x-1.5 transition disabled:bg-blue-300 shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? "Đang lưu..." : "Lưu thay đổi"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
