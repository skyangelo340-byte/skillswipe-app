import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Compass,
  MessageSquare,
  MoreHorizontal,
  Search,
  ShieldAlert,
  UserMinus,
  Video,
} from 'lucide-react';
import { getMatchPeerView, type MatchRecord } from '../types/skillswipe';
import { unmatchConversation } from '../lib/skillswipeService';
import { Avatar } from './Avatar';

interface MatchesViewProps {
  currentUid: string;
  matches: MatchRecord[];
  onOpenChat: (match: MatchRecord) => void;
  onStartCall: (match: MatchRecord) => void;
  onGoToDiscover: () => void;
  onRequestSafetyAction: (
    mode: 'block' | 'report',
    targetUid: string,
    targetName: string,
    matchId: string
  ) => void;
}

export function MatchesView({
  currentUid,
  matches,
  onOpenChat,
  onStartCall,
  onGoToDiscover,
  onRequestSafetyAction,
}: MatchesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmUnmatchId, setConfirmUnmatchId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeMatches;
    return activeMatches.filter((m) => {
      const peer = getMatchPeerView(m, currentUid);
      return (
        peer.peerName.toLowerCase().includes(q) ||
        peer.peerSkillName.toLowerCase().includes(q) ||
        peer.mySkillName.toLowerCase().includes(q)
      );
    });
  }, [activeMatches, currentUid, searchQuery]);

  const handleUnmatch = async (matchId: string) => {
    setBusyId(matchId);
    try {
      await unmatchConversation(matchId);
      setConfirmUnmatchId(null);
      setOpenMenuId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 lg:py-7 space-y-6">
      {/* Header Row with Instant Search */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#161F3B] dark:text-white tracking-tight">
            Matches
          </h1>
          <p className="text-sm text-[#161F3B]/60 dark:text-white/55 mt-1">
            <span className="font-mono-tabular font-semibold text-[#161F3B] dark:text-white">
              {activeMatches.length}
            </span>{' '}
            active mutual {activeMatches.length === 1 ? 'skill swap' : 'skill swaps'}
          </p>
        </div>

        {activeMatches.length > 0 && (
          <div className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 text-[#161F3B]/40 dark:text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or skill..."
              aria-label="Search matches"
              className="w-full h-10 rounded-full glass-surface pl-10 pr-4 text-sm text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Modern Horizontal Quick-Jump Match Strip */}
      {activeMatches.length > 0 && (
        <section aria-label="Quick jump to matches" className="space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#161F3B]/45 dark:text-white/45 px-0.5">
            Quick jump
          </div>
          <div className="flex items-center gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {activeMatches.map((match) => {
              const peer = getMatchPeerView(match, currentUid);
              const firstName = peer.peerName.split(' ')[0];
              const hasUnread = peer.unreadCount > 0;
              return (
                <button
                  key={`rail_${match.matchId}`}
                  type="button"
                  onClick={() => onOpenChat(match)}
                  className="group flex flex-col items-center gap-1.5 shrink-0 w-[68px] cursor-pointer focus:outline-none"
                >
                  <div
                    className={`relative p-[2.5px] rounded-full transition-transform duration-150 group-hover:scale-105 group-active:scale-95 ${
                      hasUnread
                        ? 'bg-gradient-to-tr from-[#7C5CFF] via-[#9CE7D3] to-[#5E3FE8]'
                        : 'bg-[#161F3B]/10 dark:bg-white/15 group-hover:bg-[#7C5CFF]/60'
                    }`}
                  >
                    <div className="p-[2px] rounded-full bg-[#F5F7FC] dark:bg-[#090C15]">
                      <Avatar name={peer.peerName} size="md" tone="auto" />
                    </div>
                    {hasUnread && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-[10px] font-bold font-mono-tabular flex items-center justify-center ring-2 ring-[#F5F7FC] dark:ring-[#090C15]">
                        {peer.unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-[#161F3B]/80 dark:text-white/80 truncate w-full text-center group-hover:text-[#6D52DC] dark:group-hover:text-[#B4A3FF] transition-colors">
                    {firstName}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {activeMatches.length === 0 ? (
        <div className="rounded-[32px] glass-surface p-10 text-center max-w-lg mx-auto space-y-5">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-[#9CE7D3]/35 dark:bg-[#9CE7D3]/15 text-[#0E4A3C] dark:text-[#8DF0D4] flex items-center justify-center">
            <Compass className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-xl font-extrabold text-[#161F3B] dark:text-white">
              No matches yet
            </h2>
            <p className="text-sm text-[#161F3B]/65 dark:text-white/60 leading-relaxed">
              Swipe right on someone whose skill you want to learn in Discover. When they swipe right on your skill too, your match unlocks here right away.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToDiscover}
            className="h-10 px-5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold hover:brightness-110 shadow-md shadow-[#6D52DC]/25 transition-all cursor-pointer"
          >
            Explore Discover
          </button>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-[28px] glass-surface p-8 text-center max-w-md mx-auto space-y-2">
          <div className="font-display text-base font-bold text-[#161F3B] dark:text-white">
            No matches found for &ldquo;{searchQuery}&rdquo;
          </div>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs font-semibold text-[#6D52DC] dark:text-[#B4A3FF] hover:underline cursor-pointer"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMatches.map((match) => {
            const peer = getMatchPeerView(match, currentUid);
            const menuOpen = openMenuId === match.matchId;

            return (
              <article
                key={match.matchId}
                className="relative rounded-[28px] glass-surface p-5 flex flex-col justify-between gap-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#7C5CFF]/30 dark:hover:border-[#7C5CFF]/40"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Avatar name={peer.peerName} size="md" tone="auto" />
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-extrabold text-[#161F3B] dark:text-white truncate">
                          {peer.peerName}
                        </h3>
                        <p className="text-xs text-[#6D52DC] dark:text-[#B4A3FF] font-semibold inline-flex items-center gap-1 mt-0.5 max-w-full">
                          <ArrowLeftRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {peer.mySkillName} ↔ {peer.peerSkillName}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {peer.unreadCount > 0 && (
                        <span className="text-[11px] font-bold font-mono-tabular text-[#6D52DC] dark:text-[#8DF0D4]">
                          {peer.unreadCount} new
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(menuOpen ? null : match.matchId)}
                        aria-label={`Options for ${peer.peerName}`}
                        className="min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center text-[#161F3B]/50 dark:text-white/50 hover:text-[#161F3B] dark:hover:text-white hover:bg-[#F5F7FC] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {menuOpen && (
                    <div className="absolute right-4 top-14 z-20 w-48 rounded-2xl bg-white dark:bg-[#1A2238] shadow-xl border border-[#161F3B]/8 dark:border-white/10 p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          setConfirmUnmatchId(match.matchId);
                        }}
                        className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#161F3B] dark:text-white hover:bg-[#F5F7FC] dark:hover:bg-white/[0.08] flex items-center gap-2 cursor-pointer"
                      >
                        <UserMinus className="w-4 h-4 text-[#161F3B]/55 dark:text-white/55" aria-hidden="true" />
                        Unmatch
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onRequestSafetyAction('report', peer.peerUid, peer.peerName, match.matchId);
                        }}
                        className="w-full min-h-[40px] px-3 rounded-xl text-left text-xs font-semibold text-[#B53D4C] dark:text-[#FF8594] hover:bg-[#F26E7E]/10 flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                        Report / Block
                      </button>
                    </div>
                  )}

                  {/* Structured Two-Way Swap Card */}
                  <div className="rounded-2xl bg-[#F4F6FC]/90 dark:bg-white/[0.045] border border-[#161F3B]/[0.05] dark:border-white/[0.06] px-3.5 py-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium text-[#161F3B]/45 dark:text-white/40 leading-none">
                        You share
                      </div>
                      <div className="font-semibold text-[#161F3B] dark:text-white truncate mt-1">
                        {peer.mySkillName}
                      </div>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-[#7C5CFF]/12 dark:bg-[#8DF0D4]/15 text-[#7C5CFF] dark:text-[#8DF0D4] flex items-center justify-center shrink-0">
                      <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="text-[10px] font-medium text-[#161F3B]/45 dark:text-white/40 leading-none">
                        They share
                      </div>
                      <div className="font-semibold text-[#145949] dark:text-[#8DF0D4] truncate mt-1">
                        {peer.peerSkillName}
                      </div>
                    </div>
                  </div>

                  {match.lastMessageText && (
                    <p className="text-xs text-[#161F3B]/60 dark:text-white/55 line-clamp-1 px-0.5">
                      &ldquo;{match.lastMessageText}&rdquo;
                    </p>
                  )}
                </div>

                {confirmUnmatchId === match.matchId ? (
                  <div className="rounded-2xl bg-[#FFF4F5] dark:bg-[#EF475A]/12 border border-transparent dark:border-[#EF475A]/20 p-3.5 space-y-2.5">
                    <p className="text-xs text-[#161F3B]/80 dark:text-white/85">
                      Unmatch {peer.peerName}? Chat and calling will be disabled.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmUnmatchId(null)}
                        className="flex-1 min-h-[38px] rounded-full bg-white dark:bg-white/10 text-xs font-semibold text-[#161F3B] dark:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busyId === match.matchId}
                        onClick={() => void handleUnmatch(match.matchId)}
                        className="flex-1 min-h-[38px] rounded-full bg-[#D94B5C] text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
                      >
                        {busyId === match.matchId ? 'Removing...' : 'Unmatch'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenChat(match)}
                      className="flex-1 h-10 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.98] shadow-sm shadow-[#6D52DC]/25 transition-all whitespace-nowrap cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      Message
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(match)}
                      aria-label={`Request video call with ${peer.peerName}`}
                      className="h-10 px-3.5 rounded-full bg-[#F5F7FC] dark:bg-white/[0.08] text-[#161F3B] dark:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.14] active:scale-[0.98] transition-all whitespace-nowrap cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5 text-[#6D52DC] dark:text-[#B4A3FF]" aria-hidden="true" />
                      Video
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
