import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  Flag,
  Globe,
  MessageSquare,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  SKILL_CATALOG,
  formatSkillLevel,
  getMatchPeerView,
  type MatchRecord,
  type PublicProfile,
  type SwipeDecision,
  type SwipeRecord,
  type UserSkill,
} from '../types/skillswipe';
import { resetPassedSwipes, submitSwipeAndCheckMatch } from '../lib/skillswipeService';
import { Avatar } from './Avatar';

interface DiscoverViewProps {
  profile: PublicProfile;
  mySkills: UserSkill[];
  allVisibleSkills: UserSkill[];
  mySwipes: SwipeRecord[];
  blockedUids: Set<string>;
  activeMatches: MatchRecord[];
  reducedMotion: boolean;
  loading: boolean;
  onOpenChat: (match: MatchRecord) => void;
  onGoToProfile: () => void;
  onRequestSafetyAction: (mode: 'block' | 'report', targetUid: string, targetName: string) => void;
}

interface PeerCandidate {
  primarySkill: UserSkill;
  category: string;
  extraSkillNames: string[];
  sharedLangs: string[];
  score: number;
}

const SKILL_CATEGORY_BY_ID = new Map<string, string>(
  SKILL_CATALOG.map((item) => [item.skillId, item.category])
);

const CATEGORY_COVER_IMAGES: Record<string, string> = {
  Music: '/src/assets/images/skill_music_cover_1795121433466.jpg',
  Coding: '/src/assets/images/skill_coding_cover_1795121432928.jpg',
  Languages: '/src/assets/images/skill_languages_cover_1795121432606.jpg',
  Creative: '/src/assets/images/skill_creative_cover_1795121434235.jpg',
  Wellness: '/src/assets/images/skill_lifestyle_cover_1795121439122.jpg',
  Lifestyle: '/src/assets/images/skill_lifestyle_cover_1795121439122.jpg',
  Academics: '/src/assets/images/skill_languages_cover_1795121432606.jpg',
  Communication: '/src/assets/images/skill_languages_cover_1795121432606.jpg',
  Strategy: '/src/assets/images/skill_coding_cover_1795121432928.jpg',
};

function getCategoryFallbackGradient(category: string): string {
  switch (category) {
    case 'Music':
      return 'from-[#2A1E52] via-[#3C2873] to-[#12162A]';
    case 'Coding':
      return 'from-[#162245] via-[#24366B] to-[#101526]';
    case 'Languages':
      return 'from-[#143742] via-[#1C4E59] to-[#0F1726]';
    case 'Creative':
      return 'from-[#3B1F47] via-[#542A5E] to-[#141628]';
    case 'Wellness':
      return 'from-[#163832] via-[#1E5046] to-[#101824]';
    case 'Lifestyle':
      return 'from-[#3E272B] via-[#573539] to-[#141626]';
    default:
      return 'from-[#182344] via-[#263461] to-[#0E1324]';
  }
}

export function DiscoverView({
  profile,
  mySkills,
  allVisibleSkills,
  mySwipes,
  blockedUids,
  activeMatches,
  reducedMotion,
  loading,
  onOpenChat,
  onGoToProfile,
  onRequestSafetyAction,
}: DiscoverViewProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [swipingBusy, setSwipingBusy] = useState(false);
  const [swipeFeedback, setSwipeFeedback] = useState<string | null>(null);
  const [celebrationMatch, setCelebrationMatch] = useState<MatchRecord | null>(null);
  const [resettingPasses, setResettingPasses] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [localHandledUids, setLocalHandledUids] = useState<Set<string>>(new Set());
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set());

  const myPrimarySkillName = mySkills[0]?.skillName || 'Skill exchange';

  const swipedUidSet = useMemo(() => {
    const set = new Set<string>(localHandledUids);
    mySwipes.forEach((sw) => {
      set.add(sw.targetUid);
    });
    return set;
  }, [mySwipes, localHandledUids]);

  const matchedUidSet = useMemo(() => {
    const set = new Set<string>();
    activeMatches.forEach((m) => {
      const peer = getMatchPeerView(m, profile.uid);
      set.add(peer.peerUid);
    });
    return set;
  }, [activeMatches, profile.uid]);

  const candidates = useMemo<PeerCandidate[]>(() => {
    const myLangSet = new Set(profile.languages.map((l) => l.toLowerCase()));
    const myAvail = profile.availability.toLowerCase();

    const byUid = new Map<string, UserSkill[]>();
    for (const card of allVisibleSkills) {
      if (card.uid === profile.uid) continue;
      if (!card.visible) continue;
      if (blockedUids.has(card.uid)) continue;
      if (swipedUidSet.has(card.uid)) continue;
      if (matchedUidSet.has(card.uid)) continue;

      const list = byUid.get(card.uid) ?? [];
      list.push(card);
      byUid.set(card.uid, list);
    }

    const result: PeerCandidate[] = [];

    for (const [, peerSkills] of byUid) {
      const primarySkill =
        peerSkills.find((s) => s.description.trim().length > 0) || peerSkills[0];
      const category = SKILL_CATEGORY_BY_ID.get(primarySkill.skillId) || 'Skill Swap';
      const extraSkillNames = Array.from(
        new Set(
          peerSkills
            .filter((s) => s.skillId !== primarySkill.skillId)
            .map((s) => s.skillName)
        )
      );

      let score = 0;
      const sharedLangs = primarySkill.languages.filter((l) =>
        myLangSet.has(l.toLowerCase())
      );
      if (sharedLangs.length > 0) score += 30;
      if (myAvail && primarySkill.availability.toLowerCase().includes(myAvail.split(' ')[0])) {
        score += 20;
      }
      if (primarySkill.description.trim().length > 15) score += 10;

      result.push({ primarySkill, category, extraSkillNames, sharedLangs, score });
    }

    return result.sort((a, b) => b.score - a.score);
  }, [
    allVisibleSkills,
    profile.uid,
    profile.languages,
    profile.availability,
    blockedUids,
    swipedUidSet,
    matchedUidSet,
  ]);

  const topCandidate = candidates[0] ?? null;
  const nextCandidate = candidates[1] ?? null;
  const upcomingCandidates = candidates.slice(1, 5);

  const passedCount = useMemo(
    () => mySwipes.filter((s) => s.decision === 'pass').length,
    [mySwipes]
  );

  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-175, 0, 175], [-8, 0, 8]);
  const cardOpacity = useTransform(dragX, [-340, -160, 0, 160, 340], [0.25, 1, 1, 1, 0.25]);
  const likeOpacity = useTransform(dragX, [18, 78], [0, 1]);
  const passOpacity = useTransform(dragX, [-78, -18], [1, 0]);
  const backCardScale = useTransform(dragX, [-140, 0, 140], [0.99, 0.95, 0.99]);
  const backCardY = useTransform(dragX, [-140, 0, 140], [2, 12, 2]);
  const animatingCardUidRef = useRef<string | null>(null);

  const handleDecision = useCallback(
    async (candidate: PeerCandidate, decision: SwipeDecision) => {
      const card = candidate.primarySkill;
      if (animatingCardUidRef.current === card.uid) return;
      animatingCardUidRef.current = card.uid;
      setSwipingBusy(true);
      setSwipeFeedback(null);
      setDetailsOpen(false);

      // Smooth GPU-composited fly-out before swapping to next card
      if (!reducedMotion) {
        const exitX = decision === 'like' ? 420 : -420;
        await animate(dragX, exitX, {
          duration: 0.16,
          ease: [0.22, 1, 0.36, 1],
        });
      }

      // Immediately advance deck with zero residual spring velocity
      dragX.jump(0);
      setLocalHandledUids((prev) => {
        const next = new Set(prev);
        next.add(card.uid);
        return next;
      });
      animatingCardUidRef.current = null;
      setSwipingBusy(false);

      // Persist swipe in background so consecutive swipes never stutter on network latency
      void submitSwipeAndCheckMatch({
        actorProfile: profile,
        actorPrimarySkillName: myPrimarySkillName,
        targetCard: card,
        decision,
      })
        .then((result) => {
          if (result.matched && result.match) {
            setCelebrationMatch(result.match);
          } else if (decision === 'like') {
            setSwipeFeedback(
              `Swiped right on ${card.displayName} (${card.skillName}). If they swipe right on your skill too, you'll match!`
            );
          }
        })
        .catch((err) => {
          setLocalHandledUids((prev) => {
            const next = new Set(prev);
            next.delete(card.uid);
            return next;
          });
          setSwipeFeedback(
            err instanceof Error
              ? err.message
              : 'Unable to save swipe right now. Check connection and try again.'
          );
        });
    },
    [dragX, profile, myPrimarySkillName, reducedMotion]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!topCandidate || celebrationMatch) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void handleDecision(topCandidate, 'pass');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void handleDecision(topCandidate, 'like');
      } else if (e.key === 'i' || e.key === 'I') {
        setDetailsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [topCandidate, celebrationMatch, handleDecision]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!topCandidate || swipingBusy) return;
    if (info.offset.x > 78 || info.velocity.x > 345) {
      void handleDecision(topCandidate, 'like');
    } else if (info.offset.x < -78 || info.velocity.x < -345) {
      void handleDecision(topCandidate, 'pass');
    }
  };

  const handleResetPasses = async () => {
    setResettingPasses(true);
    try {
      const count = await resetPassedSwipes(profile.uid);
      setLocalHandledUids(new Set());
      setSwipeFeedback(
        count > 0
          ? `Restored ${count} passed ${count === 1 ? 'profile' : 'profiles'} back into your deck.`
          : 'No passed profiles to restore.'
      );
    } catch {
      setSwipeFeedback('Could not reset passed profiles right now.');
    } finally {
      setResettingPasses(false);
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(false);
    }
  };

  const celebrationPeer = celebrationMatch
    ? getMatchPeerView(celebrationMatch, profile.uid)
    : null;

  const topCoverSrc = topCandidate ? CATEGORY_COVER_IMAGES[topCandidate.category] : undefined;
  const showTopCover = Boolean(topCoverSrc && !failedCovers.has(topCoverSrc));

  const nextCoverSrc = nextCandidate ? CATEGORY_COVER_IMAGES[nextCandidate.category] : undefined;
  const showNextCover = Boolean(nextCoverSrc && !failedCovers.has(nextCoverSrc));

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-2 pb-2 lg:py-7">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Primary Focal Stage: Full-Bleed Poster Swipe Deck */}
        <section className="lg:col-span-8 flex flex-col items-center">
          {/* Compact mobile sharing context */}
          <div className="lg:hidden w-full max-w-[440px] mb-1.5 flex items-center justify-between text-xs text-[#161F3B]/60 dark:text-white/55 px-1">
            <span className="truncate">
              Sharing: <span className="font-semibold text-[#161F3B] dark:text-white">{myPrimarySkillName}</span>
            </span>
            <span className="font-mono-tabular shrink-0">
              {candidates.length} left
            </span>
          </div>

          {swipeFeedback && (
            <div
              role="status"
              className="w-full max-w-[440px] mb-3.5 rounded-2xl bg-white dark:bg-[#141B2E] border border-[#161F3B]/[0.06] dark:border-white/[0.08] app-card-shadow px-4 py-3 text-xs sm:text-sm text-[#161F3B] dark:text-white/90 flex items-center justify-between gap-3"
            >
              <span className="leading-snug">{swipeFeedback}</span>
              <button
                type="button"
                onClick={() => setSwipeFeedback(null)}
                aria-label="Dismiss notice"
                className="min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center text-[#161F3B]/45 dark:text-white/45 hover:text-[#161F3B] dark:hover:text-white hover:bg-[#F5F7FC] dark:hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="w-full max-w-[440px] h-[540px] rounded-[36px] bg-white dark:bg-[#13192B] overflow-hidden app-deck-shadow animate-pulse border border-[#161F3B]/[0.06] dark:border-white/[0.08]">
              <div className="h-full bg-gradient-to-b from-[#161F3B]/10 to-transparent dark:from-white/5" />
            </div>
          ) : !topCandidate ? (
            <div className="w-full max-w-[440px] rounded-[36px] bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] p-8 sm:p-10 app-card-shadow text-center space-y-5">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-[#7C5CFF]/12 text-[#7C5CFF] dark:text-[#8DF0D4] flex items-center justify-center">
                <BookOpen className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-xl font-extrabold text-[#161F3B] dark:text-white">
                  You&apos;ve seen everyone for now
                </h2>
                <p className="text-sm text-[#161F3B]/65 dark:text-white/60 leading-relaxed max-w-sm mx-auto">
                  Check back soon for new peers, or bring back profiles you passed earlier.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {passedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetPasses}
                    disabled={resettingPasses}
                    className="min-h-[46px] px-5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#6142E6] text-white text-sm font-semibold inline-flex items-center gap-2 hover:brightness-110 transition-all cursor-pointer shadow-lg shadow-[#7C5CFF]/25"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    {resettingPasses ? 'Restoring...' : `Review ${passedCount} passed`}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onGoToProfile}
                  className="min-h-[46px] px-5 rounded-full bg-[#161F3B] dark:bg-white text-white dark:text-[#0E1322] text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Edit my skills
                </button>
              </div>

              <div className="pt-4 border-t border-[#161F3B]/8 dark:border-white/10 text-left space-y-2.5">
                <div className="text-xs font-semibold text-[#161F3B] dark:text-white">
                  Invite a friend to swap skills live
                </div>
                <p className="text-xs text-[#161F3B]/65 dark:text-white/60 leading-relaxed">
                  Open this link in another browser or send it to a friend to sign in, add their skill, and match in real time.
                </p>
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="min-h-[40px] px-4 rounded-full bg-[#F5F7FC] dark:bg-white/[0.08] text-xs font-semibold text-[#161F3B] dark:text-white inline-flex items-center gap-1.5 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.14] transition-colors cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#145949] dark:text-[#8DF0D4]" aria-hidden="true" />
                      Link copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" />
                      Copy invite link
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[440px] space-y-2.5 sm:space-y-4">
              {/* Physical Poster Card Stack */}
              <div className="relative pt-0.5 pb-1">
                {nextCandidate && !reducedMotion && (
                  <motion.div
                    aria-hidden="true"
                    style={{ scale: backCardScale, y: backCardY, willChange: 'transform' }}
                    className="absolute inset-x-3 top-2 bottom-0 rounded-[32px] sm:rounded-[36px] overflow-hidden bg-[#141B2E] border border-white/10 pointer-events-none transform-gpu"
                  >
                    {showNextCover && nextCoverSrc && (
                      <img
                        src={nextCoverSrc}
                        alt=""
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-35"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0D1221] via-[#0D1221]/70 to-transparent" />
                  </motion.div>
                )}

                <motion.article
                  key={topCandidate.primarySkill.uid}
                  drag={reducedMotion || detailsOpen ? false : 'x'}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={1}
                  dragTransition={{ bounceStiffness: 520, bounceDamping: 36 }}
                  onDragEnd={handleDragEnd}
                  style={
                    reducedMotion
                      ? undefined
                      : { x: dragX, rotate, opacity: cardOpacity, willChange: 'transform, opacity' }
                  }
                  whileDrag={reducedMotion ? undefined : { cursor: 'grabbing' }}
                  className={`relative h-[clamp(440px,calc(100dvh-180px),620px)] lg:h-[clamp(560px,calc(100dvh-110px),660px)] rounded-[32px] sm:rounded-[36px] bg-gradient-to-br ${getCategoryFallbackGradient(topCandidate.category)} text-white shadow-xl shadow-black/25 dark:shadow-black/55 ring-1 ring-inset ring-white/15 overflow-hidden select-none touch-pan-y transform-gpu flex flex-col justify-between ${
                    detailsOpen ? '' : 'cursor-grab'
                  }`}
                >
                  {/* Full-Bleed Atmospheric Editorial Cover */}
                  {showTopCover && topCoverSrc && (
                    <img
                      src={topCoverSrc}
                      alt={`${topCandidate.primarySkill.skillName} craft atmosphere`}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onError={() =>
                        setFailedCovers((prev) => {
                          const next = new Set(prev);
                          next.add(topCoverSrc);
                          return next;
                        })
                      }
                      className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                    />
                  )}

                  {/* Cinematic Multi-Stop Dissolve Scrim (Seamless Poster Transition) */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0F1E] via-[#0B0F1E]/85 via-48% to-[#0B0F1E]/20"
                  />

                  {/* Dynamic Swipe Gesture Stamps */}
                  {!reducedMotion && (
                    <>
                      <motion.div
                        style={{ opacity: likeOpacity, willChange: 'opacity' }}
                        className="pointer-events-none absolute top-14 left-6 z-30 rounded-2xl border-2 border-[#0B3D30] bg-[#8DF0D4] px-4 py-1.5 font-display text-xs font-extrabold tracking-wider text-[#0B3D30] -rotate-6"
                      >
                        SWAP SKILLS
                      </motion.div>
                      <motion.div
                        style={{ opacity: passOpacity, willChange: 'opacity' }}
                        className="pointer-events-none absolute top-14 right-6 z-30 rounded-2xl border-2 border-[#9B2C3B] bg-[#FFE4E8] px-4 py-1.5 font-display text-xs font-extrabold tracking-wider text-[#9B2C3B] rotate-6"
                      >
                        PASS
                      </motion.div>
                    </>
                  )}

                  {/* Top Zone: Category Kicker + Safety Button */}
                  <div className="relative z-10 px-4 pt-3.5 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-[#8DF0D4] tracking-wide">
                        {topCandidate.category} · {formatSkillLevel(topCandidate.primarySkill.level)}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          onRequestSafetyAction(
                            'report',
                            topCandidate.primarySkill.uid,
                            topCandidate.primarySkill.displayName
                          )
                        }
                        aria-label={`Report or block ${topCandidate.primarySkill.displayName}`}
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#0B0F1E]/65 border border-white/15 text-white/85 hover:bg-[#0B0F1E]/85 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <Flag className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Zone: Expressive Poster Content */}
                  <div className="relative z-10 px-5 pb-5 pt-8 sm:px-6 sm:pb-6 sm:pt-12 space-y-3 sm:space-y-4">
                    {/* Hero Skill Headline */}
                    <div>
                      <h2
                        className="font-display text-[28px] sm:text-[36px] font-extrabold tracking-tight text-white leading-[1.06]"
                        style={{ textWrap: 'balance' }}
                      >
                        {topCandidate.primarySkill.skillName}
                      </h2>
                      {topCandidate.extraSkillNames.length > 0 && (
                        <div className="text-xs text-white/75 mt-1 truncate">
                          Also shares: {topCandidate.extraSkillNames.join(' · ')}
                        </div>
                      )}
                    </div>

                    {/* Peer Identity Row */}
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={topCandidate.primarySkill.displayName}
                        photoUrl={topCandidate.primarySkill.photoUrl}
                        size="md"
                        tone="auto"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-base font-bold text-white truncate">
                          {topCandidate.primarySkill.displayName}
                        </div>
                        <div className="text-xs text-white/70 truncate">
                          {topCandidate.primarySkill.timezone} · {topCandidate.primarySkill.availability || 'Flexible'}
                        </div>
                      </div>
                    </div>

                    {/* Structured Two-Way Skill Swap Strip (GPU-fast tinted surface) */}
                    <div className="rounded-2xl bg-[#0F162B]/88 border border-white/[0.11] px-3 py-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="text-[10px] font-medium text-white/45 leading-none">
                          You share
                        </div>
                        <div className="font-semibold text-white truncate mt-1">
                          {myPrimarySkillName}
                        </div>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C5CFF]/35 to-[#8DF0D4]/25 border border-white/15 text-[#8DF0D4] flex items-center justify-center shrink-0">
                        <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 text-right">
                        <div className="text-[10px] font-medium text-white/45 leading-none">
                          You learn
                        </div>
                        <div className="font-semibold text-[#8DF0D4] truncate mt-1">
                          {topCandidate.primarySkill.skillName}
                        </div>
                      </div>
                    </div>

                    {/* Concise Teaching Pitch */}
                    <p className="text-sm leading-relaxed text-white/85 line-clamp-3">
                      {topCandidate.primarySkill.description ||
                        `Happy to share ${topCandidate.primarySkill.skillName.toLowerCase()} (${formatSkillLevel(topCandidate.primarySkill.level).toLowerCase()} level) in exchange for learning your skill.`}
                    </p>

                    {/* Clean Unboxed Metadata Strip */}
                    <div className="pt-2.5 border-t border-white/12 flex items-center justify-between gap-3 text-xs text-white/70">
                      <span className="inline-flex items-center gap-1.5 truncate">
                        <Globe className="w-3.5 h-3.5 text-[#8DF0D4] shrink-0" aria-hidden="true" />
                        <span className="truncate">{topCandidate.primarySkill.languages.join(' · ')}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetailsOpen(true)}
                        className="text-xs font-semibold text-[#8DF0D4] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Full profile
                      </button>
                    </div>
                  </div>

                  {/* In-Card Slide-Up Frosted Details Sheet */}
                  {detailsOpen && (
                    <motion.div
                      initial={reducedMotion ? undefined : { y: '100%' }}
                      animate={{ y: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 z-30 bg-[#0D1324]/95 backdrop-blur-2xl p-6 flex flex-col justify-between overflow-y-auto"
                    >
                      <div className="space-y-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                              name={topCandidate.primarySkill.displayName}
                              photoUrl={topCandidate.primarySkill.photoUrl}
                              size="md"
                              tone="auto"
                            />
                            <div className="min-w-0">
                              <div className="font-display text-base font-extrabold text-white truncate">
                                {topCandidate.primarySkill.displayName}
                              </div>
                              <div className="text-xs text-[#8DF0D4] truncate">
                                {topCandidate.primarySkill.skillName} · {formatSkillLevel(topCandidate.primarySkill.level)}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setDetailsOpen(false)}
                            aria-label="Close profile details"
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          >
                            <X className="w-5 h-5" aria-hidden="true" />
                          </button>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-white/50">
                            What you&apos;ll learn together
                          </div>
                          <p className="text-sm text-white/90 leading-relaxed">
                            {topCandidate.primarySkill.description ||
                              `Open to swapping ${topCandidate.primarySkill.skillName} sessions.`}
                          </p>
                        </div>

                        {topCandidate.primarySkill.bio && (
                          <div className="space-y-2 pt-3 border-t border-white/10">
                            <div className="text-xs font-semibold text-white/50">
                              About {topCandidate.primarySkill.displayName}
                            </div>
                            <p className="text-sm text-white/80 leading-relaxed">
                              {topCandidate.primarySkill.bio}
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/10 text-xs">
                          <div className="space-y-1">
                            <div className="text-white/50 inline-flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-[#8DF0D4]" aria-hidden="true" />
                              Languages
                            </div>
                            <div className="font-semibold text-white">
                              {topCandidate.primarySkill.languages.join(' · ')}
                            </div>
                            {topCandidate.sharedLangs.length > 0 && (
                              <div className="text-[#8DF0D4]">Shared language</div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="text-white/50 inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-[#8DF0D4]" aria-hidden="true" />
                              Schedule
                            </div>
                            <div className="font-semibold text-white">
                              {topCandidate.primarySkill.availability || 'Flexible schedule'}
                            </div>
                            <div className="text-white/55">{topCandidate.primarySkill.timezone}</div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-5 border-t border-white/10 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailsOpen(false);
                              onRequestSafetyAction(
                                'block',
                                topCandidate.primarySkill.uid,
                                topCandidate.primarySkill.displayName
                              );
                            }}
                            className="font-semibold text-[#F26E7E] hover:underline cursor-pointer"
                          >
                            Block user
                          </button>
                          <span className="text-white/25" aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={() => {
                              setDetailsOpen(false);
                              onRequestSafetyAction(
                                'report',
                                topCandidate.primarySkill.uid,
                                topCandidate.primarySkill.displayName
                              );
                            }}
                            className="font-semibold text-white/70 hover:text-white hover:underline cursor-pointer"
                          >
                            Report profile
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setDetailsOpen(false)}
                          className="px-4 py-2 rounded-full bg-white/12 hover:bg-white/20 text-white font-semibold cursor-pointer"
                        >
                          Back to card
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.article>
              </div>

              <div className="hidden lg:block text-center text-[11px] text-[#161F3B]/45 dark:text-white/40 font-mono-tabular">
                {candidates.length} {candidates.length === 1 ? 'profile' : 'profiles'} left · Swipe or press ← / →
              </div>
            </div>
          )}
        </section>

        {/* Desktop Side Panel */}
        <aside className="hidden lg:flex lg:col-span-4 flex-col gap-5">
          <div className="rounded-[28px] glass-surface p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-[#161F3B]/55 dark:text-white/50">
                  Your skill to swap
                </div>
                <h2 className="font-display text-lg font-extrabold text-[#161F3B] dark:text-white mt-0.5">
                  {myPrimarySkillName}
                </h2>
                {mySkills.length > 1 && (
                  <p className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                    +{mySkills.length - 1} more on your profile
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onGoToProfile}
                className="min-h-[34px] px-3.5 rounded-full bg-[#F5F7FC] dark:bg-white/[0.08] text-xs font-semibold text-[#7C5CFF] dark:text-[#8DF0D4] hover:bg-[#EAE8FA] dark:hover:bg-white/[0.14] transition-colors shrink-0 cursor-pointer"
              >
                Edit
              </button>
            </div>
            <p className="text-xs text-[#161F3B]/65 dark:text-white/60 leading-relaxed pt-2.5 border-t border-[#161F3B]/6 dark:border-white/[0.08]">
              Swipe right when you want to learn someone&apos;s skill. When they also swipe right on yours, you match automatically.
            </p>
          </div>

          {upcomingCandidates.length > 0 && (
            <div className="rounded-[28px] glass-surface p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-extrabold text-[#161F3B] dark:text-white">
                  Up next in Discover
                </h2>
                <span className="text-xs font-mono-tabular text-[#161F3B]/45 dark:text-white/45">
                  +{candidates.length - 1}
                </span>
              </div>
              <ul className="divide-y divide-[#161F3B]/6 dark:divide-white/[0.06]">
                {upcomingCandidates.map((item) => (
                  <li
                    key={item.primarySkill.uid}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center gap-3"
                  >
                    <Avatar
                      name={item.primarySkill.displayName}
                      photoUrl={item.primarySkill.photoUrl}
                      size="sm"
                      tone="auto"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#161F3B] dark:text-white truncate">
                        {item.primarySkill.displayName}
                      </div>
                      <div className="text-[11px] text-[#161F3B]/60 dark:text-white/55 truncate">
                        {item.primarySkill.skillName} · {formatSkillLevel(item.primarySkill.level)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {passedCount > 0 && (
            <button
              type="button"
              onClick={handleResetPasses}
              disabled={resettingPasses}
              className="w-full min-h-[44px] rounded-2xl bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] app-card-shadow text-xs font-semibold text-[#161F3B]/75 dark:text-white/75 hover:text-[#7C5CFF] dark:hover:text-[#8DF0D4] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              {resettingPasses ? 'Restoring passed profiles...' : `Review ${passedCount} passed profiles`}
            </button>
          )}
        </aside>
      </div>

      {/* Elevated Mutual Skill Swap Celebration Modal */}
      {celebrationMatch && celebrationPeer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-celebration-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-5"
        >
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-[34px] bg-white dark:bg-[#13192B] border border-[#161F3B]/10 dark:border-white/12 p-7 sm:p-8 text-center shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-center gap-3 pt-1">
              <Avatar
                name={profile.displayName}
                photoUrl={profile.photoUrl}
                size="lg"
                tone="midnight"
              />
              <div className="w-11 h-11 rounded-full bg-[#8DF0D4] text-[#0B3D30] flex items-center justify-center shadow-md">
                <ArrowLeftRight className="w-5 h-5" aria-hidden="true" />
              </div>
              <Avatar
                name={celebrationPeer.peerName}
                size="lg"
                tone="auto"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#7C5CFF] dark:text-[#8DF0D4]">
                Mutual skill swap · {celebrationPeer.mySkillName} ↔ {celebrationPeer.peerSkillName}
              </p>
              <h2
                id="match-celebration-title"
                className="font-display text-2xl font-extrabold text-[#161F3B] dark:text-white tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                It&apos;s a match with {celebrationPeer.peerName}!
              </h2>
              <p className="text-sm text-[#161F3B]/65 dark:text-white/65 leading-relaxed">
                You want to learn <span className="font-semibold text-[#161F3B] dark:text-white">{celebrationPeer.peerSkillName}</span> and they want to learn <span className="font-semibold text-[#161F3B] dark:text-white">{celebrationPeer.mySkillName}</span>. Start chatting now to plan your swap.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setCelebrationMatch(null)}
                className="flex-1 h-11 rounded-full bg-[#F5F7FC] dark:bg-white/[0.08] text-[#161F3B] dark:text-white text-xs font-semibold hover:bg-[#E8ECF7] dark:hover:bg-white/[0.14] transition-colors cursor-pointer"
              >
                Keep swiping
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = celebrationMatch;
                  setCelebrationMatch(null);
                  onOpenChat(m);
                }}
                className="flex-1 h-11 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:brightness-110 shadow-md shadow-[#7C5CFF]/30 transition-all cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                Send a message
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
