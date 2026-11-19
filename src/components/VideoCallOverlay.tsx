import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  acceptIncomingVideoCall,
  CALL_RING_TIMEOUT_MS,
  declineVideoCall,
  initiateVideoCall,
  markCallActive,
  requestLocalMediaStream,
  stopMediaStream,
  terminateVideoCall,
  type CallSessionHandles,
} from '../lib/webrtcService';
import { getMatchPeerView, type MatchRecord, type VideoCallRecord } from '../types/skillswipe';
import { Avatar } from './Avatar';

interface VideoCallOverlayProps {
  currentUid: string;
  currentName: string;
  outgoingTarget: MatchRecord | null;
  incomingCall: VideoCallRecord | null;
  onClose: () => void;
}

type UiPhase =
  | 'incoming'
  | 'requesting_media'
  | 'ringing_out'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'declined'
  | 'timeout'
  | 'permission_denied'
  | 'failed';

export function VideoCallOverlay({
  currentUid,
  currentName,
  outgoingTarget,
  incomingCall,
  onClose,
}: VideoCallOverlayProps) {
  const [phase, setPhase] = useState<UiPhase>(incomingCall ? 'incoming' : 'requesting_media');
  const [activeCallId, setActiveCallId] = useState<string | null>(incomingCall?.callId ?? null);
  const [connectionLabel, setConnectionLabel] = useState('Preparing secure connection...');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const handlesRef = useRef<CallSessionHandles | null>(null);
  const callIdRef = useRef<string | null>(incomingCall?.callId ?? null);
  const answerAppliedRef = useRef(false);

  const outgoingPeer = outgoingTarget ? getMatchPeerView(outgoingTarget, currentUid) : null;
  const peerName = incomingCall
    ? incomingCall.initiatorName
    : outgoingPeer?.peerName || 'Peer';

  const skillName =
    incomingCall?.skillName ?? outgoingTarget?.skillSwapLabel ?? 'Skill swap';

  const cleanupMediaAndPeer = () => {
    handlesRef.current?.cleanup();
    handlesRef.current = null;
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!outgoingTarget || incomingCall) return;
    let cancelled = false;

    const startOutgoing = async () => {
      setPhase('requesting_media');
      setConnectionLabel('Requesting camera & mic access...');
      try {
        const stream = await requestLocalMediaStream('user');
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const peer = getMatchPeerView(outgoingTarget, currentUid);
        const recipientUid = peer.peerUid;
        const recipientName = peer.peerName;

        const { callId, handles } = await initiateVideoCall({
          match: outgoingTarget,
          initiatorUid: currentUid,
          initiatorName: currentName,
          recipientUid,
          recipientName,
          localStream: stream,
          onRemoteStream: (remoteStream) => {
            setHasRemoteVideo(true);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
          },
          onConnectionStateChange: (state) => {
            if (state === 'connected') {
              setPhase('active');
              setConnectionLabel('Connected');
              void markCallActive(callId);
            } else if (state === 'connecting') {
              setConnectionLabel('Connecting peer-to-peer...');
            } else if (state === 'disconnected') {
              setConnectionLabel('Reconnecting...');
            } else if (state === 'failed') {
              setPhase('failed');
              setErrorDetail(
                'WebRTC peer connection failed. Direct STUN traversal can fail behind strict firewalls without a TURN relay.'
              );
              void terminateVideoCall(callId, 'failed');
              cleanupMediaAndPeer();
            }
          },
        });

        if (cancelled) {
          handles.cleanup();
          stopMediaStream(stream);
          void terminateVideoCall(callId, 'ended');
          return;
        }

        handlesRef.current = handles;
        callIdRef.current = callId;
        setActiveCallId(callId);
        setPhase('ringing_out');
        setConnectionLabel(`Ringing ${recipientName}...`);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.toLowerCase().includes('permission') ||
          msg.toLowerCase().includes('denied') ||
          msg.toLowerCase().includes('notallowed')
        ) {
          setPhase('permission_denied');
          setErrorDetail(
            'Camera or microphone permission was denied. Allow access in your browser settings to start a video call.'
          );
        } else {
          setPhase('failed');
          setErrorDetail(msg || 'Could not start video call.');
        }
      }
    };

    void startOutgoing();

    return () => {
      cancelled = true;
      cleanupMediaAndPeer();
    };
  }, [outgoingTarget, incomingCall, currentUid, currentName]);

  useEffect(() => {
    if (!activeCallId) return;

    const unsubscribe = onSnapshot(doc(db, 'calls', activeCallId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as VideoCallRecord;

      if (
        data.initiatorUid === currentUid &&
        data.answerSdp &&
        !answerAppliedRef.current &&
        handlesRef.current
      ) {
        answerAppliedRef.current = true;
        setPhase('connecting');
        setConnectionLabel('Accepted · Connecting video...');
        void handlesRef.current.pc
          .setRemoteDescription({ type: 'answer', sdp: data.answerSdp })
          .catch(() => {
            setPhase('failed');
            setErrorDetail('Failed to establish peer media handshake.');
          });
      }

      if (data.status === 'declined' || data.status === 'busy') {
        cleanupMediaAndPeer();
        setPhase('declined');
        setErrorDetail(`${peerName} declined the video call request.`);
      } else if (data.status === 'timeout') {
        cleanupMediaAndPeer();
        setPhase('timeout');
        setErrorDetail(`${peerName} did not answer in time.`);
      } else if (data.status === 'ended') {
        cleanupMediaAndPeer();
        setPhase('ended');
      } else if (data.status === 'failed') {
        cleanupMediaAndPeer();
        setPhase('failed');
      }
    });

    return () => unsubscribe();
  }, [activeCallId, currentUid, peerName]);

  useEffect(() => {
    if (phase !== 'ringing_out' || !activeCallId) return;
    const timer = window.setTimeout(() => {
      cleanupMediaAndPeer();
      setPhase('timeout');
      setErrorDetail(`${peerName} did not answer within 45 seconds.`);
      void terminateVideoCall(activeCallId, 'timeout');
    }, CALL_RING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, activeCallId, peerName]);

  useEffect(() => {
    if (phase !== 'active') return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [phase]);

  const handleAcceptIncoming = async () => {
    if (!incomingCall) return;
    setPhase('requesting_media');
    setConnectionLabel('Requesting camera & mic access...');
    try {
      const stream = await requestLocalMediaStream('user');
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setPhase('connecting');
      setConnectionLabel('Connecting to peer...');

      const handles = await acceptIncomingVideoCall({
        call: incomingCall,
        recipientUid: currentUid,
        localStream: stream,
        onRemoteStream: (remoteStream) => {
          setHasRemoteVideo(true);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') {
            setPhase('active');
            setConnectionLabel('Connected');
            void markCallActive(incomingCall.callId);
          } else if (state === 'disconnected') {
            setConnectionLabel('Reconnecting...');
          } else if (state === 'failed') {
            setPhase('failed');
            setErrorDetail(
              'Peer connection could not traverse this network. A TURN relay may be required.'
            );
            void terminateVideoCall(incomingCall.callId, 'failed');
            cleanupMediaAndPeer();
          }
        },
      });

      handlesRef.current = handles;
      callIdRef.current = incomingCall.callId;
      setActiveCallId(incomingCall.callId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('notallowed')
      ) {
        setPhase('permission_denied');
        setErrorDetail('Camera or microphone permission was denied. No media was shared.');
      } else {
        setPhase('failed');
        setErrorDetail(msg || 'Could not accept video call.');
      }
      void declineVideoCall(incomingCall.callId, 'declined');
    }
  };

  const handleDeclineIncoming = async () => {
    if (incomingCall) {
      await declineVideoCall(incomingCall.callId, 'declined');
    }
    cleanupMediaAndPeer();
    onClose();
  };

  const handleHangUp = async () => {
    const id = callIdRef.current;
    cleanupMediaAndPeer();
    if (id) {
      await terminateVideoCall(id, 'ended');
    }
    onClose();
  };

  const toggleMic = () => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const nextMuted = !micMuted;
    tracks.forEach((t) => {
      t.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  };

  const toggleCamera = () => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const nextOff = !cameraOff;
    tracks.forEach((t) => {
      t.enabled = !nextOff;
    });
    setCameraOff(nextOff);
  };

  const flipCamera = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const sender = handlesRef.current?.pc
        .getSenders()
        .find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }

      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });
      localStreamRef.current?.addTrack(newVideoTrack);
      newVideoTrack.enabled = !cameraOff;
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setFacingMode(nextFacing);
    } catch {
      // Single-camera devices ignore flip gracefully
    }
  };

  const formattedTimer = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(
    elapsedSeconds % 60
  ).padStart(2, '0')}`;

  const isInSession =
    phase === 'ringing_out' || phase === 'connecting' || phase === 'active' || phase === 'requesting_media';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="SkillSwipe video call"
      className="fixed inset-0 z-50 bg-[#0A0F1F] text-white overflow-hidden"
    >
      {/* Subtle ambient background depth when remote video isn't streaming yet */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-[#6D52DC]/20 blur-[140px]"
      />

      {/* Full-Bleed Remote Video Stage */}
      {isInSession && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover ${hasRemoteVideo ? 'block' : 'hidden'}`}
        />
      )}

      {/* Subtle top & bottom gradient scrims for glass UI legibility over video */}
      {isInSession && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/65 to-transparent z-10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/75 to-transparent z-10"
          />
        </>
      )}

      {/* Floating Frosted Top Header */}
      <header className="relative z-20 px-4 sm:px-6 pt-4 sm:pt-5 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-3 rounded-full bg-[#111933]/70 backdrop-blur-2xl border border-white/12 px-4 py-2 max-w-[78vw] sm:max-w-md">
          <Avatar name={peerName} size="xs" tone="auto" />
          <div className="min-w-0">
            <div className="font-display text-sm font-bold text-white truncate">
              {peerName}
            </div>
            <div className="text-[11px] text-white/70 truncate flex items-center gap-1.5">
              <span className="truncate">{skillName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-[#9CE7D3] shrink-0">
                {phase === 'active' ? formattedTimer : connectionLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#111933]/70 backdrop-blur-2xl border border-white/12 px-3.5 py-2 text-xs text-white/80">
          <ShieldCheck className="w-4 h-4 text-[#9CE7D3]" aria-hidden="true" />
          <span>Direct 1:1 · Not recorded</span>
        </div>
      </header>

      {/* Center Stage Content */}
      <main className="relative z-20 h-[calc(100%-76px)] flex items-center justify-center p-5">
        {phase === 'incoming' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm rounded-[36px] bg-[#131C38]/85 backdrop-blur-2xl border border-white/12 p-8 text-center shadow-2xl space-y-7"
          >
            <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-[#9CE7D3]/20 animate-ping"
              />
              <Avatar name={peerName} size="xl" tone="auto" className="relative z-10 ring-4 ring-white/15" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#9CE7D3]">
                Incoming video call · {skillName}
              </p>
              <h2 className="font-display text-2xl font-extrabold text-white tracking-tight">
                {peerName}
              </h2>
              <p className="text-xs text-white/65 leading-relaxed">
                Your camera and microphone stay off until you tap Accept.
              </p>
            </div>

            <div className="flex items-center justify-center gap-8 pt-2">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeclineIncoming}
                  aria-label="Decline video call"
                  className="w-16 h-16 rounded-full bg-[#EF475A] text-white flex items-center justify-center shadow-lg shadow-[#EF475A]/30 hover:bg-[#DC384B] active:scale-95 transition-all cursor-pointer"
                >
                  <PhoneOff className="w-6 h-6" aria-hidden="true" />
                </button>
                <span className="text-xs font-medium text-white/75">Decline</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleAcceptIncoming}
                  aria-label="Accept video call"
                  className="w-16 h-16 rounded-full bg-[#24B48E] text-white flex items-center justify-center shadow-lg shadow-[#24B48E]/30 hover:bg-[#1E9E7C] active:scale-95 transition-all cursor-pointer"
                >
                  <Phone className="w-6 h-6" aria-hidden="true" />
                </button>
                <span className="text-xs font-medium text-white/75">Accept</span>
              </div>
            </div>
          </motion.div>
        ) : phase === 'declined' ||
          phase === 'timeout' ||
          phase === 'ended' ||
          phase === 'permission_denied' ||
          phase === 'failed' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm rounded-[34px] bg-[#131C38]/85 backdrop-blur-2xl border border-white/12 p-8 text-center shadow-2xl space-y-5"
          >
            <div className="w-16 h-16 mx-auto rounded-3xl bg-white/10 text-[#9CE7D3] flex items-center justify-center">
              {phase === 'ended' ? (
                <Video className="w-7 h-7" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-7 h-7 text-[#F26E7E]" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-extrabold text-white">
                {phase === 'ended'
                  ? 'Call ended'
                  : phase === 'declined'
                    ? 'Call declined'
                    : phase === 'timeout'
                      ? 'No answer'
                      : phase === 'permission_denied'
                        ? 'Permission required'
                        : 'Connection unavailable'}
              </h2>
              <p className="text-sm text-white/70 leading-relaxed">
                {errorDetail || 'All camera tracks and signaling data have been cleared.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[48px] rounded-full bg-white text-[#141D38] font-display font-bold text-sm hover:bg-[#F5F7FC] active:scale-[0.98] transition-all cursor-pointer"
            >
              Back to messages
            </button>
          </motion.div>
        ) : (
          !hasRemoteVideo && (
            <div className="text-center space-y-5 pb-20">
              <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
                {phase === 'ringing_out' && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[#6D52DC]/35 animate-ping"
                  />
                )}
                <Avatar name={peerName} size="xl" tone="auto" className="relative z-10 ring-4 ring-white/15" />
              </div>
              <div className="space-y-1">
                <div className="font-display text-2xl font-extrabold text-white">{peerName}</div>
                <div className="text-sm text-white/70">{connectionLabel}</div>
              </div>
            </div>
          )
        )}
      </main>

      {/* Floating Picture-in-Picture Local Camera */}
      {isInSession && (
        <div className="fixed bottom-28 right-4 sm:bottom-8 sm:right-6 z-30 w-28 sm:w-48 aspect-[3/4] sm:aspect-video rounded-3xl overflow-hidden bg-[#161F3B] ring-1 ring-white/25 shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''} ${
              cameraOff ? 'opacity-0' : 'opacity-100'
            }`}
          />
          {cameraOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/60 text-[11px]">
              <CameraOff className="w-4 h-4" aria-hidden="true" />
              <span>Camera off</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Glass Pill Control Dock */}
      {(phase === 'ringing_out' || phase === 'connecting' || phase === 'active') && (
        <footer className="fixed bottom-5 sm:bottom-7 left-1/2 -translate-x-1/2 z-30 pb-safe">
          <div className="flex items-center gap-2.5 sm:gap-3 rounded-full bg-[#111933]/80 backdrop-blur-2xl border border-white/14 p-2.5 shadow-2xl">
            <button
              type="button"
              onClick={toggleMic}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                micMuted
                  ? 'bg-white text-[#141D38]'
                  : 'bg-white/12 text-white hover:bg-white/20'
              }`}
            >
              {micMuted ? (
                <MicOff className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Mic className="w-5 h-5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                cameraOff
                  ? 'bg-white text-[#141D38]'
                  : 'bg-white/12 text-white hover:bg-white/20'
              }`}
            >
              {cameraOff ? (
                <CameraOff className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Camera className="w-5 h-5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void flipCamera()}
              aria-label="Switch front or rear camera"
              className="w-14 h-14 rounded-full bg-white/12 text-white hover:bg-white/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-5 h-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => void handleHangUp()}
              aria-label="End video call"
              className="h-14 px-6 rounded-full bg-[#EF475A] text-white font-display font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-[#DC384B] active:scale-95 transition-all shadow-lg shadow-[#EF475A]/30 cursor-pointer"
            >
              <PhoneOff className="w-5 h-5" aria-hidden="true" />
              <span className="hidden sm:inline">End</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
