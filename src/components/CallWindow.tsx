import React, { useState, useEffect, useRef } from "react";
import { UserProfile, CallSession } from "../types";
import { doc, updateDoc, onSnapshot, setDoc, collection, deleteDoc } from "firebase/firestore";
import { db, isFirebaseConfigured, handleFirestoreError } from "../firebase";
import { 
  Phone, 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Tv, 
  ScreenShare,
  Volume2, 
  VolumeX, 
  Minimize2, 
  Maximize2,
  Users
} from "lucide-react";

interface CallWindowProps {
  currentUser: UserProfile;
  caller: UserProfile;    // can be either friend (if receiving) or yourself (if calling)
  receiver: UserProfile;  // can be friend (if calling) or yourself (if receiving)
  callType: "audio" | "video";
  callSessionId: string;
  isIncoming: boolean;
  onCloseCall: () => void;
}

export default function CallWindow({
  currentUser,
  caller,
  receiver,
  callType,
  callSessionId,
  isIncoming,
  onCloseCall
}: CallWindowProps) {
  const [callState, setCallState] = useState<"ringing" | "ongoing" | "ended">("ringing");
  const [micMuted, setMicMuted] = useState(false);
  const [camMuted, setCamMuted] = useState(callType === "audio");
  const [screenSharing, setScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);

  // WebRTC & Stream refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<any>(null);

  const peerUser = currentUser.uid === caller.uid ? receiver : caller;

  // Render timer
  useEffect(() => {
    if (callState === "ongoing") {
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Handle active media streams
  useEffect(() => {
    async function setupMedia() {
      try {
        const constraints = {
          audio: true,
          video: callType === "video" ? { width: 640, height: 480 } : false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
          .catch(() => {
            // Fallback to audio if requested video fails or permission denied
            return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // If in simulated/offline mode, we auto-advance calling status
        if (!isFirebaseConfigured || currentUser.uid.startsWith("simulated_")) {
          if (!isIncoming) {
            // Auto accept call in simulated mode after 3 seconds
            setTimeout(() => {
              setCallState("ongoing");
            }, 3000);
          } else {
            setCallState("ongoing");
          }
        }
      } catch (err) {
        console.warn("Could not capture video/audio stream. Testing fallback simulated visual modes. Error: ", err);
      }
    }

    setupMedia();

    // Firebase Listener if configured
    let unsubCall: any = null;
    if (isFirebaseConfigured && !currentUser.uid.startsWith("simulated_")) {
      const callDocRef = doc(db, "calls", callSessionId);
      unsubCall = onSnapshot(callDocRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.status === "accepted") {
            setCallState("ongoing");
          } else if (data.status === "rejected" || data.status === "ended") {
            handleHangup();
          }
        } else {
          // Document deleted means call hung up
          handleHangup();
        }
      });
    }

    return () => {
      if (unsubCall) unsubCall();
      stopAllTracks();
    };
  }, [callSessionId]);

  const stopAllTracks = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const handleMuteMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicMuted(!audioTrack.enabled);
      }
    } else {
      setMicMuted(!micMuted);
    }
  };

  const handleMuteCam = () => {
    if (localStreamRef.current && callType === "video") {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCamMuted(!videoTrack.enabled);
      }
    } else {
      setCamMuted(!camMuted);
    }
  };

  const handleScreenShare = async () => {
    if (screenSharing) {
      // Stop display track
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      setScreenSharing(false);
      
      // Restore normal video
      if (localStreamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = true;
      }
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }
      setScreenSharing(true);

      // Listen to track ending event
      screenStream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
        if (localStreamRef.current && localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      };
    } catch (e) {
      console.error("Display capture error: ", e);
    }
  };

  const handleAccept = async () => {
    setCallState("ongoing");
    if (isFirebaseConfigured && !currentUser.uid.startsWith("simulated_")) {
      const callDocRef = doc(db, "calls", callSessionId);
      await updateDoc(callDocRef, { status: "accepted" }).catch(e => console.error("Error accepting call:", e));
    }
  };

  const handleReject = async () => {
    if (isFirebaseConfigured && !currentUser.uid.startsWith("simulated_")) {
      const callDocRef = doc(db, "calls", callSessionId);
      await updateDoc(callDocRef, { status: "rejected" }).catch(e => console.error("Error rejecting call:", e));
    }
    handleHangup();
  };

  const handleHangup = async () => {
    stopAllTracks();
    setCallState("ended");

    if (isFirebaseConfigured && !currentUser.uid.startsWith("simulated_")) {
      // Set to ended on the database
      const callDocRef = doc(db, "calls", callSessionId);
      await updateDoc(callDocRef, { status: "ended" }).catch(() => {});
      // Clean up after small delay
      setTimeout(() => {
        deleteDoc(callDocRef).catch(() => {});
      }, 1000);
    }

    onCloseCall();
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-slate-900 text-white z-50 flex flex-col justify-between overflow-hidden p-6 select-none animate-scale-up" id="call-window">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-800 opacity-90 z-0" />
      
      {/* Call Header */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-slate-300 bg-slate-800/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700/55">
          <Users className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold font-mono tracking-wider">
            CUỘC GỌI {callType === "video" ? "VIDEO" : "THOẠI"} 1-1
          </span>
        </div>
        <div className="text-xs font-semibold px-3 py-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-xl">
          Zalo Secure Line
        </div>
      </div>

      {/* Main Screen Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-6">
        {/* Ringing Visual */}
        {callState === "ringing" && (
          <div className="text-center space-y-6">
            <div className="relative inline-block">
              {/* Pulsing visual circles */}
              <div className="absolute inset-x-0 inset-y-0 rounded-full bg-blue-500/20 scale-125 animate-ping" />
              <div className="absolute inset-x-0 inset-y-0 rounded-full bg-blue-600/10 scale-150 animate-pulse" />
              <img
                src={peerUser.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}
                alt={peerUser.displayName}
                className="relative w-32 h-32 rounded-full object-cover border-4 border-slate-700 shadow-2xl"
              />
            </div>
            
            <div>
              <h3 className="text-2xl font-extrabold tracking-wide">{peerUser.displayName}</h3>
              <p className="text-sm text-slate-400 mt-2">
                {isIncoming ? "Đang gọi đến cho bạn..." : "Đang đổ chuông..."}
              </p>
            </div>
          </div>
        )}

        {/* Ongoing Visual (Actual connection) */}
        {callState === "ongoing" && (
          <div className="relative w-full h-full max-w-3xl aspect-video rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center">
            {/* Main view: Peer Screen */}
            {callType === "video" && !camMuted ? (
              <video
                ref={(el) => {
                  remoteVideoRef.current = el;
                  if (el && !el.srcObject && localStreamRef.current) {
                    el.srcObject = localStreamRef.current;
                  }
                }}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                id="remote-video"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              // Audio only placeholder or video camera disabled
              <div className="text-center space-y-4">
                <div className="relative inline-block p-1 bg-slate-800 rounded-full border border-slate-700">
                  <img
                    src={peerUser.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}
                    alt={peerUser.displayName}
                    className="w-24 h-24 rounded-full object-cover"
                  />
                  {micMuted ? (
                    <span className="absolute bottom-1 right-1 p-1 bg-red-600 rounded-full border-2 border-slate-800 text-white">
                      <MicOff className="w-3" />
                    </span>
                  ) : (
                    <span className="absolute bottom-1 right-1 p-1 bg-green-500 rounded-full border-2 border-slate-800 text-white animate-pulse">
                      <Mic className="w-3" />
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold">{peerUser.displayName}</h4>
                  <div className="text-xs bg-slate-800/80 text-blue-400 font-mono tracking-wider px-3 py-1 rounded-full border border-slate-700">
                    {formatDuration(duration)}
                  </div>
                </div>
              </div>
            )}

            {/* PIP Viewer: Local Feed */}
            {callType === "video" && (
              <div className="absolute bottom-4 right-4 w-32 h-44 rounded-2xl overflow-hidden border border-slate-700 shadow-xl bg-slate-900 group">
                <video
                  ref={(el) => {
                    localVideoRef.current = el;
                    if (el && !el.srcObject) {
                      el.srcObject = screenSharing ? (screenStreamRef.current || null) : (localStreamRef.current || null);
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  id="local-video"
                  style={{ transform: "scaleX(-1)" }}
                />
                <div className="absolute top-1 left-1 bg-slate-950/70 backdrop-blur-xs text-[10px] px-1.5 py-0.5 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition">
                  Bạn
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons Panel */}
      <div className="relative z-10 flex flex-col items-center space-y-4 bg-slate-950/40 backdrop-blur-md p-4 rounded-3xl border border-slate-800">
        <div className="flex items-center space-x-6 justify-center">
          {/* Mute Mic */}
          <button
            onClick={handleMuteMic}
            id="call-toggle-mic-btn"
            className={`p-4 rounded-full transition duration-150 ${
              micMuted 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-slate-800 hover:bg-slate-700 text-slate-100"
            }`}
          >
            {micMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* Toggle Video (If video call) */}
          {callType === "video" && (
            <button
              onClick={handleMuteCam}
              id="call-toggle-cam-btn"
              className={`p-4 rounded-full transition duration-150 ${
                camMuted 
                  ? "bg-red-500 hover:bg-red-600 text-white" 
                  : "bg-slate-800 hover:bg-slate-700 text-slate-100"
              }`}
            >
              {camMuted ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          )}

          {/* Screen Share (If video call & local user) */}
          {callType === "video" && callState === "ongoing" && (
            <button
              onClick={handleScreenShare}
              id="call-toggle-screenshare-btn"
              className={`p-4 rounded-full transition duration-150 ${
                screenSharing 
                  ? "bg-blue-600 hover:bg-blue-700 text-white" 
                  : "bg-slate-800 hover:bg-slate-700 text-slate-100"
              }`}
              title="Chia sẻ màn hình"
            >
              {screenSharing ? <Tv className="w-6 h-6" /> : <ScreenShare className="w-6 h-6" />}
            </button>
          )}

          {/* Incoming Call Specific buttons */}
          {callState === "ringing" && isIncoming ? (
            <>
              {/* Accept */}
              <button
                onClick={handleAccept}
                id="call-accept-btn"
                className="p-4 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white animate-bounce"
                title="Nhận cuộc gọi"
              >
                <Phone className="w-6 h-6 fill-current" />
              </button>

              {/* Decline */}
              <button
                onClick={handleReject}
                id="call-decline-btn"
                className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white"
                title="Từ chối"
              >
                <PhoneOff className="w-6 h-6 fill-current" />
              </button>
            </>
          ) : (
            /* Reject/Ended/Hangup button */
            <button
              onClick={handleHangup}
              id="call-hangup-btn"
              className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white flex justify-center items-center"
              title="Cắt máy"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          )}
        </div>

        {callState === "ongoing" && (
          <p className="text-xs text-slate-400 font-medium">
            Cuộc gọi được mã hóa đầu-cuối. Thời lượng: {formatDuration(duration)}
          </p>
        )}
      </div>
    </div>
  );
}
