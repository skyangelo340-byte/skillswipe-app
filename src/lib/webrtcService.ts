import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { CallStatus, MatchRecord, VideoCallRecord } from '../types/skillswipe';

/**
 * Default STUN servers for direct P2P WebRTC traversal.
 * Note: Symmetric NAT / CGNAT / restrictive corporate firewalls require a configured TURN relay.
 */
export function buildRtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  // Optional TURN configuration via environment variables (no hardcoded secrets)
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCred = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  if (turnUrl && turnUser && turnCred) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCred,
    });
  }

  return { iceServers, iceCandidatePoolSize: 4 };
}

export const CALL_RING_TIMEOUT_MS = 45_000;

export async function requestLocalMediaStream(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera and microphone access is not supported in this browser.');
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 960 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true },
  });
}

export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore already-stopped tracks
    }
  });
}

export interface CallSessionHandles {
  pc: RTCPeerConnection;
  unsubscribeSignals: Unsubscribe;
  cleanup: () => void;
}

/**
 * Initiator creates a call invitation document in Firestore (`status: 'ringing'`) with SDP offer.
 * Media travels exclusively via WebRTC RTCPeerConnection, never through Firestore.
 */
export async function initiateVideoCall(params: {
  match: MatchRecord;
  initiatorUid: string;
  initiatorName: string;
  recipientUid: string;
  recipientName: string;
  localStream: MediaStream;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}): Promise<{ callId: string; handles: CallSessionHandles }> {
  const { match, initiatorUid, initiatorName, recipientUid, recipientName, localStream } = params;
  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const pc = new RTCPeerConnection(buildRtcConfiguration());
  const remoteStream = new MediaStream();

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    params.onRemoteStream(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    params.onConnectionStateChange(pc.connectionState);
  };

  const pendingLocalCandidates: RTCIceCandidateInit[] = [];
  let callDocCreated = false;

  const pushIceCandidate = async (candidate: RTCIceCandidateInit) => {
    try {
      await addDoc(collection(db, 'calls', callId, 'signals'), {
        fromUid: initiatorUid,
        kind: 'ice',
        payload: JSON.stringify(candidate).slice(0, 4000),
        createdAt: serverTimestamp(),
      });
    } catch {
      // Call may have already ended
    }
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const json = event.candidate.toJSON();
    if (callDocCreated) {
      void pushIceCandidate(json);
    } else {
      pendingLocalCandidates.push(json);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  try {
    await setDoc(doc(db, 'calls', callId), {
      callId,
      matchId: match.matchId,
      skillId: 'skill_swap',
      skillName: (match.skillSwapLabel || 'Skill swap').slice(0, 60),
      initiatorUid,
      initiatorName: initiatorName.slice(0, 60),
      recipientUid,
      recipientName: recipientName.slice(0, 60),
      participantIds: [initiatorUid, recipientUid],
      status: 'ringing' as CallStatus,
      offerSdp: (offer.sdp || '').slice(0, 16000),
      answerSdp: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    callDocCreated = true;
    for (const c of pendingLocalCandidates) {
      void pushIceCandidate(c);
    }
  } catch (error) {
    pc.close();
    handleFirestoreError(error, OperationType.CREATE, `calls/${callId}`);
  }

  const seenSignalIds = new Set<string>();
  const unsubscribeSignals = onSnapshot(
    collection(db, 'calls', callId, 'signals'),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added' || seenSignalIds.has(change.doc.id)) return;
        seenSignalIds.add(change.doc.id);
        const data = change.doc.data();
        if (data.fromUid === initiatorUid || data.kind !== 'ice') return;
        try {
          const candidate = JSON.parse(data.payload) as RTCIceCandidateInit;
          if (pc.remoteDescription) {
            void pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch {
          // Ignore malformed candidate
        }
      });
    },
    (error) => {
      console.error('Signal listener error:', error);
    }
  );

  return {
    callId,
    handles: {
      pc,
      unsubscribeSignals,
      cleanup: () => {
        unsubscribeSignals();
        try {
          pc.close();
        } catch {
          // ignore
        }
      },
    },
  };
}

/**
 * Recipient explicitly accepts an incoming ringing call AFTER camera/mic permission is granted.
 */
export async function acceptIncomingVideoCall(params: {
  call: VideoCallRecord;
  recipientUid: string;
  localStream: MediaStream;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}): Promise<CallSessionHandles> {
  const { call, recipientUid, localStream } = params;
  const pc = new RTCPeerConnection(buildRtcConfiguration());
  const remoteStream = new MediaStream();

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    params.onRemoteStream(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    params.onConnectionStateChange(pc.connectionState);
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    void addDoc(collection(db, 'calls', call.callId, 'signals'), {
      fromUid: recipientUid,
      kind: 'ice',
      payload: JSON.stringify(event.candidate.toJSON()).slice(0, 4000),
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  await pc.setRemoteDescription({ type: 'offer', sdp: call.offerSdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  try {
    await updateDoc(doc(db, 'calls', call.callId), {
      status: 'connecting' as CallStatus,
      answerSdp: (answer.sdp || '').slice(0, 16000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    pc.close();
    handleFirestoreError(error, OperationType.UPDATE, `calls/${call.callId}`);
  }

  const seenSignalIds = new Set<string>();
  const unsubscribeSignals = onSnapshot(
    collection(db, 'calls', call.callId, 'signals'),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added' || seenSignalIds.has(change.doc.id)) return;
        seenSignalIds.add(change.doc.id);
        const data = change.doc.data();
        if (data.fromUid === recipientUid || data.kind !== 'ice') return;
        try {
          const candidate = JSON.parse(data.payload) as RTCIceCandidateInit;
          void pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore malformed candidate
        }
      });
    },
    (error) => {
      console.error('Signal listener error:', error);
    }
  );

  return {
    pc,
    unsubscribeSignals,
    cleanup: () => {
      unsubscribeSignals();
      try {
        pc.close();
      } catch {
        // ignore
      }
    },
  };
}

export async function declineVideoCall(callId: string, status: 'declined' | 'busy' = 'declined'): Promise<void> {
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
  }
}

export async function markCallActive(callId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if call already transitioned
  }
}

export async function terminateVideoCall(
  callId: string,
  reason: 'ended' | 'timeout' | 'failed' = 'ended'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: reason,
      offerSdp: '',
      answerSdp: '',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Call may already be in a terminal state
  }
}
