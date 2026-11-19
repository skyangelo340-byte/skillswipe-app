import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowLeftRight,
  Ban,
  ChevronUp,
  Flag,
  Lock,
  MessageSquare,
  MoreVertical,
  RotateCcw,
  Search,
  Send,
  UserMinus,
  Video,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  fetchOlderMessages,
  markMatchAsRead,
  sendChatMessage,
  unmatchConversation,
} from '../lib/skillswipeService';
import { getMatchPeerView, LIMITS, type ChatMessage, type MatchRecord } from '../types/skillswipe';
import { Avatar } from './Avatar';

interface ChatsViewProps {
  currentUid: string;
  matches: MatchRecord[];
  selectedMatchId: string | null;
  onSelectMatch: (matchId: string | null) => void;
  onStartCall: (match: MatchRecord) => void;
  onRequestSafetyAction: (
    mode: 'block' | 'report',
    targetUid: string,
    targetName: string,
    matchId: string
  ) => void;
}

function formatMessageTime(msg: ChatMessage): string {
  const date = msg.createdAt?.toDate
    ? msg.createdAt.toDate()
    : msg.localCreatedAtMs
      ? new Date(msg.localCreatedAtMs)
      : null;
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatsView({
  currentUid,
  matches,
  selectedMatchId,
  onSelectMatch,
  onStartCall,
  onRequestSafetyAction,
}: ChatsViewProps) {
  const [threadSearch, setThreadSearch] = useState('');

  const activeMatches = useMemo(() => {
    return matches
      .filter((m) => m.status === 'active')
      .sort((a, b) => {
        const ta = a.lastMessageAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const tb = b.lastMessageAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    if (!q) return activeMatches;
    return activeMatches.filter((m) => {
      const peer = getMatchPeerView(m, currentUid);
      return (
        peer.peerName.toLowerCase().includes(q) ||
        peer.peerSkillName.toLowerCase().includes(q) ||
        peer.mySkillName.toLowerCase().includes(q)
      );
    });
  }, [activeMatches, currentUid, threadSearch]);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.matchId === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );

  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [oldestLiveDoc, setOldestLiveDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLiveMessages([]);
    setOlderMessages([]);
    setOptimisticMessages([]);
    setOldestLiveDoc(null);
    setHasMoreOlder(false);
    setChatError(null);
    setMenuOpen(false);

    if (!selectedMatch || selectedMatch.status !== 'active') {
      return;
    }

    setLoadingChat(true);
    const path = `matches/${selectedMatch.matchId}/messages`;
    const q = query(
      collection(db, 'matches', selectedMatch.matchId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs;
        const parsed = docs
          .map((d) => ({ ...(d.data() as ChatMessage), localStatus: 'sent' as const }))
          .reverse();
        setLiveMessages(parsed);
        setOldestLiveDoc(docs.length > 0 ? docs[docs.length - 1] : null);
        setHasMoreOlder(docs.length === 30);
        setLoadingChat(false);

        const confirmedNonces = new Set(parsed.map((m) => m.clientNonce));
        setOptimisticMessages((prev) => prev.filter((om) => !confirmedNonces.has(om.clientNonce)));

        void markMatchAsRead(selectedMatch, currentUid).catch(() => {});
      },
      (error) => {
        setLoadingChat(false);
        setChatError('Unable to load messages. This match may no longer be active.');
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch {
          // Handled cleanly in local chat banner
        }
      }
    );

    return () => unsubscribe();
  }, [selectedMatch?.matchId, selectedMatch?.status, currentUid]);

  const combinedMessages = useMemo(() => {
    const byNonce = new Map<string, ChatMessage>();
    [...olderMessages, ...liveMessages, ...optimisticMessages].forEach((m) => {
      byNonce.set(m.clientNonce || m.messageId, m);
    });
    return Array.from(byNonce.values()).sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? a.localCreatedAtMs ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.localCreatedAtMs ?? 0;
      return ta - tb;
    });
  }, [olderMessages, liveMessages, optimisticMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [combinedMessages.length, selectedMatch?.matchId]);

  const handleLoadOlder = async () => {
    if (!selectedMatch || !oldestLiveDoc || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await fetchOlderMessages(selectedMatch.matchId, oldestLiveDoc, 25);
      setOlderMessages((prev) => [...result.messages, ...prev]);
      setOldestLiveDoc(result.lastDoc);
      setHasMoreOlder(result.messages.length === 25);
    } catch {
      setChatError('Could not load older messages right now.');
    } finally {
      setLoadingOlder(false);
    }
  };

  const executeSend = async (textToSend: string, existingNonce?: string) => {
    if (!selectedMatch || selectedMatch.status !== 'active') return;
    const trimmed = textToSend.trim().slice(0, LIMITS.MESSAGE_MAX);
    if (!trimmed) return;

    const nonce =
      existingNonce || `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const optimistic: ChatMessage = {
      messageId: nonce,
      senderUid: currentUid,
      text: trimmed,
      type: 'text',
      clientNonce: nonce,
      localStatus: 'pending',
      localCreatedAtMs: Date.now(),
    };

    setOptimisticMessages((prev) => [
      ...prev.filter((m) => m.clientNonce !== nonce),
      optimistic,
    ]);
    if (!existingNonce) setDraftText('');
    setChatError(null);

    try {
      await sendChatMessage({
        match: selectedMatch,
        senderUid: currentUid,
        text: trimmed,
        clientNonce: nonce,
      });
    } catch {
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.clientNonce === nonce ? { ...m, localStatus: 'failed' } : m
        )
      );
      setChatError('Message failed to send. Tap retry once reconnected.');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSend(draftText);
  };

  const peerInfo = useMemo(() => {
    if (!selectedMatch) return null;
    return getMatchPeerView(selectedMatch, currentUid);
  }, [selectedMatch, currentUid]);

  const quickOpeners = useMemo(() => {
    if (!peerInfo) return [];
    return [
      `Hey ${peerInfo.peerName.split(' ')[0]}! Excited to swap ${peerInfo.mySkillName} for ${peerInfo.peerSkillName}.`,
      `What days and times usually work best for our first 30-min session?`,
    ];
  }, [peerInfo]);

  return (
    <div className="w-full max-w-6xl mx-auto px-0 sm:px-6 sm:py-5 h-[calc(100vh-140px)] lg:h-[calc(100vh-40px)] flex flex-col">
      <div className="flex-1 min-h-0 bg-white/90 dark:bg-[#12182A]/90 sm:glass-surface sm:rounded-[32px] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Pane: Conversations List */}
        <aside
          className={`lg:col-span-4 border-r border-[#161F3B]/8 dark:border-white/[0.08] flex flex-col min-h-0 bg-white/70 dark:bg-[#12182A]/75 ${
            selectedMatch ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="px-5 pt-5 pb-4 space-y-3 border-b border-[#161F3B]/6 dark:border-white/[0.07]">
            <div>
              <h1 className="font-display text-2xl font-extrabold text-[#161F3B] dark:text-white tracking-tight">
                Messages
              </h1>
              <p className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                Private 1:1 skill swap threads
              </p>
            </div>

            {activeMatches.length > 0 && (
              <div className="relative">
                <Search
                  className="w-4 h-4 text-[#161F3B]/40 dark:text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Search conversations..."
                  aria-label="Search conversations"
                  className="w-full min-h-[40px] rounded-full bg-[#F5F7FC] dark:bg-white/[0.06] pl-9 pr-4 text-xs text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50 transition-colors"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
            {activeMatches.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.07] text-[#6D52DC] dark:text-[#B4A3FF] flex items-center justify-center">
                  <MessageSquare className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="font-display text-sm font-bold text-[#161F3B] dark:text-white">
                  No active conversations
                </div>
                <p className="text-xs text-[#161F3B]/60 dark:text-white/55 leading-relaxed">
                  Private chat unlocks as soon as you and another peer swipe right on each other.
                </p>
              </div>
            ) : filteredMatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#161F3B]/55 dark:text-white/50">
                No conversations match &ldquo;{threadSearch}&rdquo;
              </div>
            ) : (
              filteredMatches.map((match) => {
                const peer = getMatchPeerView(match, currentUid);
                const isSelected = match.matchId === selectedMatchId;

                return (
                  <button
                    key={match.matchId}
                    type="button"
                    onClick={() => onSelectMatch(match.matchId)}
                    className={`w-full text-left px-3.5 py-3 rounded-2xl flex items-center gap-3.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#6D52DC]/10 dark:bg-[#7C5CFF]/18 ring-1 ring-[#6D52DC]/20 dark:ring-[#7C5CFF]/30'
                        : 'hover:bg-[#F5F7FC] dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <Avatar name={peer.peerName} size="md" tone="auto" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-[#161F3B] dark:text-white truncate">
                          {peer.peerName}
                        </span>
                        {peer.unreadCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-[11px] font-bold font-mono-tabular inline-flex items-center justify-center">
                            {peer.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6D52DC] dark:text-[#B4A3FF] font-semibold truncate">
                        {peer.mySkillName} ↔ {peer.peerSkillName}
                      </div>
                      <div className="text-xs text-[#161F3B]/55 dark:text-white/50 truncate mt-0.5">
                        {match.lastMessageText || 'Say hello to start swapping!'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Pane: 1:1 Thread */}
        <section
          className={`lg:col-span-8 flex flex-col min-h-0 bg-[#F6F8FD] dark:bg-[#0A0E1B] chat-canvas-pattern ${
            selectedMatch ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!selectedMatch || !peerInfo ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] app-card-shadow flex items-center justify-center text-[#6D52DC] dark:text-[#B4A3FF]">
                <MessageSquare className="w-7 h-7" aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg font-extrabold text-[#161F3B] dark:text-white">
                Select a conversation
              </h2>
              <p className="text-sm text-[#161F3B]/60 dark:text-white/55 max-w-sm leading-relaxed">
                Pick a mutual match on the left to chat, plan your skill swap, or launch an accepted 1:1 video session.
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <header className="bg-white/90 dark:bg-[#13192B]/88 backdrop-blur-xl border-b border-[#161F3B]/6 dark:border-white/[0.08] px-4 sm:px-5 h-16 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectMatch(null)}
                    aria-label="Back to conversations"
                    className="lg:hidden min-w-[40px] min-h-[40px] -ml-1 rounded-full flex items-center justify-center text-[#161F3B] dark:text-white hover:bg-[#F5F7FC] dark:hover:bg-white/[0.08] cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <Avatar name={peerInfo.peerName} size="sm" tone="auto" />
                  <div className="min-w-0">
                    <div className="font-display text-sm sm:text-base font-extrabold text-[#161F3B] dark:text-white truncate">
                      {peerInfo.peerName}
                    </div>
                    <div className="text-xs text-[#161F3B]/55 dark:text-white/55 truncate inline-flex items-center gap-1 max-w-full">
                      <ArrowLeftRight className="w-3 h-3 text-[#6D52DC] dark:text-[#8DF0D4] shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {peerInfo.mySkillName} ↔ {peerInfo.peerSkillName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 relative">
                  {selectedMatch.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => onStartCall(selectedMatch)}
                      className="h-9 px-3.5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-110 shadow-sm shadow-[#6D52DC]/25 transition-all whitespace-nowrap cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Video call</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Conversation safety options"
                    className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-[#161F3B]/65 dark:text-white/65 hover:bg-[#F5F7FC] dark:hover:bg-white/[0.08] cursor-pointer"
                  >
                    <MoreVertical className="w-5 h-5" aria-hidden="true" />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-12 z-30 w-52 rounded-2xl bg-white dark:bg-[#1A2238] shadow-xl border border-[#161F3B]/8 dark:border-white/10 p-1.5">
                      {selectedMatch.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            void unmatchConversation(selectedMatch.matchId);
                          }}
                          className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#161F3B] dark:text-white hover:bg-[#F5F7FC] dark:hover:bg-white/[0.08] flex items-center gap-2 cursor-pointer"
                        >
                          <UserMinus className="w-4 h-4 text-[#161F3B]/55 dark:text-white/55" aria-hidden="true" />
                          Unmatch
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onRequestSafetyAction(
                            'block',
                            peerInfo.peerUid,
                            peerInfo.peerName,
                            selectedMatch.matchId
                          );
                        }}
                        className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#B53D4C] dark:text-[#FF8594] hover:bg-[#F26E7E]/10 flex items-center gap-2 cursor-pointer"
                      >
                        <Ban className="w-4 h-4" aria-hidden="true" />
                        Block {peerInfo.peerName}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onRequestSafetyAction(
                            'report',
                            peerInfo.peerUid,
                            peerInfo.peerName,
                            selectedMatch.matchId
                          );
                        }}
                        className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#161F3B] dark:text-white hover:bg-[#F5F7FC] dark:hover:bg-white/[0.08] flex items-center gap-2 cursor-pointer"
                      >
                        <Flag className="w-4 h-4 text-[#6D52DC] dark:text-[#B4A3FF]" aria-hidden="true" />
                        Report misuse
                      </button>
                    </div>
                  )}
                </div>
              </header>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-3">
                {selectedMatch.status !== 'active' ? (
                  <div className="rounded-2xl bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] app-card-shadow p-5 text-center text-sm text-[#161F3B]/75 dark:text-white/75">
                    This conversation is no longer active ({selectedMatch.status}). Messaging and video calling have been permanently disabled.
                  </div>
                ) : loadingChat ? (
                  <div className="text-center text-xs text-[#161F3B]/50 dark:text-white/45 py-8">
                    Loading messages...
                  </div>
                ) : (
                  <>
                    {hasMoreOlder && (
                      <div className="text-center pb-2">
                        <button
                          type="button"
                          onClick={handleLoadOlder}
                          disabled={loadingOlder}
                          className="min-h-[38px] px-4 rounded-full bg-white dark:bg-[#19223A] border border-[#161F3B]/[0.06] dark:border-white/[0.08] app-card-shadow text-xs font-semibold text-[#161F3B] dark:text-white inline-flex items-center gap-1.5 hover:bg-[#F5F7FC] dark:hover:bg-white/[0.12] cursor-pointer"
                        >
                          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                          {loadingOlder ? 'Loading...' : 'Load older messages'}
                        </button>
                      </div>
                    )}

                    {combinedMessages.length === 0 ? (
                      <div className="rounded-3xl bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] app-card-shadow p-6 text-center max-w-md mx-auto my-6 space-y-4">
                        <div className="flex justify-center">
                          <Avatar name={peerInfo.peerName} size="lg" tone="auto" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="font-display text-base font-extrabold text-[#161F3B] dark:text-white">
                            Start your swap with {peerInfo.peerName}
                          </div>
                          <p className="text-xs text-[#161F3B]/65 dark:text-white/60 leading-relaxed">
                            You share{' '}
                            <span className="font-semibold text-[#161F3B] dark:text-white">
                              {peerInfo.mySkillName}
                            </span>{' '}
                            and {peerInfo.peerName} shares{' '}
                            <span className="font-semibold text-[#145949] dark:text-[#8DF0D4]">
                              {peerInfo.peerSkillName}
                            </span>
                            .
                          </p>
                        </div>

                        <div className="space-y-2 pt-1">
                          {quickOpeners.map((opener) => (
                            <button
                              key={opener}
                              type="button"
                              onClick={() => void executeSend(opener)}
                              className="w-full min-h-[42px] px-4 py-2.5 rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] hover:bg-[#EAE8FA] dark:hover:bg-[#7C5CFF]/20 text-left text-xs font-medium text-[#161F3B] dark:text-white/90 transition-colors cursor-pointer"
                            >
                              &ldquo;{opener}&rdquo;
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      combinedMessages.map((msg) => {
                        const mine = msg.senderUid === currentUid;
                        return (
                          <div
                            key={msg.clientNonce || msg.messageId}
                            className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[82%] sm:max-w-[70%] rounded-[22px] px-4 py-2.5 text-sm leading-relaxed break-words ${
                                mine
                                  ? 'bg-gradient-to-br from-[#7C5CFF] to-[#5E3FE8] text-white rounded-br-md shadow-sm shadow-[#6D52DC]/20'
                                  : 'bg-white dark:bg-[#19223A] text-[#161F3B] dark:text-white/95 rounded-bl-md border border-transparent dark:border-white/[0.07] app-card-shadow'
                              }`}
                            >
                              {msg.text}
                            </div>
                            <div className="mt-1 px-1.5 flex items-center gap-2 text-[11px] text-[#161F3B]/45 dark:text-white/40 font-mono-tabular">
                              <span>{formatMessageTime(msg)}</span>
                              {mine && msg.localStatus === 'pending' && <span>Sending...</span>}
                              {mine && msg.localStatus === 'failed' && (
                                <button
                                  type="button"
                                  onClick={() => void executeSend(msg.text, msg.clientNonce)}
                                  className="text-[#C94858] dark:text-[#FF8594] font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                  Retry
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={bottomRef} />
                  </>
                )}
              </div>

              {chatError && (
                <div className="px-4 py-2 bg-[#F26E7E]/15 text-[#A83847] dark:text-[#FF8E9C] text-xs font-medium">
                  {chatError}
                </div>
              )}

              {/* Modern Capsule Composer */}
              {selectedMatch.status === 'active' && (
                <div className="bg-white/95 dark:bg-[#13192B]/95 backdrop-blur-xl border-t border-[#161F3B]/6 dark:border-white/[0.08] px-4 py-3 shrink-0">
                  <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={draftText}
                      maxLength={LIMITS.MESSAGE_MAX}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder={`Message ${peerInfo.peerName}...`}
                      aria-label="Type a message"
                      className="flex-1 h-10 rounded-full bg-[#F5F7FC] dark:bg-white/[0.07] px-4 text-sm text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50 focus:bg-white dark:focus:bg-[#1A2238] transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={draftText.trim().length === 0}
                      aria-label="Send message"
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C5CFF] to-[#5E3FE8] text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shrink-0 shadow-sm shadow-[#6D52DC]/25"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </form>
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#161F3B]/45 dark:text-white/40">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    <span>Private chat between you and {peerInfo.peerName}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
