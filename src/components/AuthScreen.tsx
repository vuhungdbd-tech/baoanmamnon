import React, { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { MessageSquare, Lock, Mail, User, Radio, KeyRound } from "lucide-react";

interface AuthScreenProps {
  onAuthSuccess: (userId: string, userDetails: any) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Simulated login/register for offline testing
  const handleSimulatedAuth = () => {
    setLoading(true);
    setTimeout(() => {
      const uId = "simulated_user_" + Math.random().toString(36).substr(2, 9);
      const userObj = {
        uid: uId,
        displayName: displayName || email.split("@")[0] || "Trần Khách",
        email: email || "khach@zalo.ai",
        photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
        bio: bio || "Xin chào! Mình đang sử dụng Zalo Chat.",
        status: "online" as const,
        lastSeen: new Date().toISOString()
      };
      
      // Save simulated user details to localStorage
      localStorage.setItem("zalo_simulated_user", JSON.stringify(userObj));
      onAuthSuccess(uId, userObj);
      setLoading(false);
    }, 850);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
    setLoading(true);

    if (!email) {
      setError("Vui lòng nhập địa chỉ email.");
      setLoading(false);
      return;
    }

    // Direct simulated mode fallback if Firebase is not linked yet
    if (!isFirebaseConfigured) {
      if (mode === "forgot") {
        setInfoMessage("Yêu cầu Reset mật khẩu đã được gửi (Simulated).");
        setLoading(false);
        return;
      }
      handleSimulatedAuth();
      return;
    }

    try {
      if (mode === "login") {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        onAuthSuccess(userCred.user.uid, {
          uid: userCred.user.uid,
          displayName: userCred.user.displayName || userCred.user.email?.split("@")[0] || "Người dùng Zalo",
          email: userCred.user.email,
          photoURL: userCred.user.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
          status: "online"
        });
      } else if (mode === "register") {
        if (!displayName) {
          setError("Vui lòng nhập tên hiển thị.");
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError("Mật khẩu phải chứa ít nhất 6 ký tự.");
          setLoading(false);
          return;
        }

        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, {
          displayName: displayName,
          photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"
        });

        // Initialize Firestore user profile
        const userProfile = {
          uid: userCred.user.uid,
          displayName: displayName,
          email: email,
          photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
          status: "online",
          bio: bio || "Xin chào! Mình đang sử dụng Zalo Chat App.",
          lastSeen: new Date().toISOString()
        };

        await setDoc(doc(db, "users", userCred.user.uid), userProfile);
        onAuthSuccess(userCred.user.uid, userProfile);
      } else if (mode === "forgot") {
        await sendPasswordResetEmail(auth, email);
        setInfoMessage("Email thay đổi mật khẩu đã được gửi đến hòm thư của bạn.");
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setError("Tên đăng nhập hoặc mật khẩu không chính xác.");
      } else if (err.code === "auth/email-already-in-use") {
        setError("Địa chỉ email này đã được sử dụng.");
      } else {
        setError(err.message || "Đã xảy ra lỗi hệ thống.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-container" className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center space-x-2 text-blue-600">
          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-md">
            <MessageSquare className="w-8 h-8 fill-current" />
          </div>
          <span className="text-3xl font-extrabold tracking-wide font-sans text-blue-600">Zalo</span>
          <span className="text-sm bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">AI</span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-800">
          {mode === "login" && "Đăng nhập tài khoản"}
          {mode === "register" && "Đăng ký thành viên"}
          {mode === "forgot" && "Khôi phục mật khẩu"}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          Ứng dụng nhắn tin thông minh, bảo mật &amp; nhanh chóng
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-slate-100">
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 text-sm rounded-r-lg" id="auth-error">
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 p-3 text-sm rounded-r-lg" id="auth-info">
              {infoMessage}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-semibold text-slate-700">Email</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 h-5" />
                </div>
                <input
                  id="email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="pl-10 block w-full border border-slate-300 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700">Mật khẩu</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-5 h-5" />
                  </div>
                  <input
                    id="password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 block w-full border border-slate-300 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                  />
                </div>
              </div>
            )}

            {mode === "register" && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Tên hiển thị</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <User className="h-5 h-5" />
                    </div>
                    <input
                      id="name-input"
                      type="text"
                      required={mode === "register"}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="pl-10 block w-full border border-slate-300 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700">Giới thiệu ngắn (Bio)</label>
                  <textarea
                    id="bio-input"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Ví dụ: Đang đi làm, bận rộn..."
                    rows={2}
                    className="mt-1 block w-full border border-slate-300 rounded-xl py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                  />
                </div>
              </>
            )}

            {mode === "login" && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  id="forgot-password-toggle"
                  onClick={() => { setError(""); setMode("forgot"); }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-500"
                >
                  Quên mật khẩu?
                </button>
              </div>
            )}

            <div>
              <button
                type="submit"
                id="auth-submit-btn"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 disabled:bg-blue-300"
              >
                {loading ? "Đang xử lý..." : (
                  <>
                    {mode === "login" && "Đăng nhập"}
                    {mode === "register" && "Đăng ký tài khoản"}
                    {mode === "forgot" && "Gửi yêu cầu đặt lại mật khẩu"}
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs font-semibold uppercase">
                <span className="bg-white px-2 text-slate-400">Hoặc chuyển đổi</span>
              </div>
            </div>

            <div className="mt-4 text-center">
              {mode === "login" ? (
                <button
                  type="button"
                  id="switch-to-register-btn"
                  onClick={() => { setError(""); setMode("register"); }}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-500"
                >
                  Chưa có tài khoản? <span className="underline">Đăng ký ngay</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="switch-to-login-btn"
                  onClick={() => { setError(""); setMode("login"); }}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-500"
                >
                  Đã có tài khoản? <span className="underline">Quay lại Đăng nhập</span>
                </button>
              )}
            </div>
          </div>

          {!isFirebaseConfigured && (
            <div className="mt-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs" id="sandbox-indicator">
              <div className="flex items-center space-x-1.5 font-bold mb-1">
                <Radio className="w-4 h-4 text-amber-600 animate-pulse" />
                <span>Chế độ Trực quan Mock-Sandbox</span>
              </div>
              Hệ thống đang chạy cục bộ để bạn trải nghiệm ngay lập tức. Sau khi nhấn Đăng nhập hoặc Đăng ký, bạn có thể chat và thử nghiệm cuộc gọi video/audio 100% hoàn chỉnh.
            </div>
          )}

          {isFirebaseConfigured && (
            <div className="mt-6 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs" id="production-auth-indicator">
              <div className="flex items-center space-x-1.5 font-bold mb-0.5">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>Đã kết nối Firebase Cloud</span>
              </div>
              Đăng nhập qua database Firestore và Firebase Auth thực tế của bạn. Đảm bảo bạn đã kích hoạt Email/Password Auth trong Firebase Console của mình.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
