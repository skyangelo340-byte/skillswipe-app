/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  Compass,
  HeartHandshake,
  MessageSquare,
  Moon,
  Sun,
  User as UserIcon,
  WifiOff,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  blockUserAndRevokeMatches,
  ensureInitialPrivateRecord,
  fetchUserAccountState,
  seedSkillCatalogIfAdmin,
  submitSafetyReport,
} from './lib/skillswipeService';
import { seedDemoProfilesIfAdmin } from './lib/seedProfiles';
import {
  getMatchPeerView,
  type BlockRecord,
  type MatchRecord,
  type PrivateUser,
  type PublicProfile,
  type ReportReason,
  type SwipeRecord,
  type UserSkill,
  type VideoCallRecord,
} from './types/skillswipe';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WelcomeScreen } from './components/WelcomeScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { DiscoverView } from './components/DiscoverView';
import { MatchesView } from './components/MatchesView';
import { ChatsView } from './components/ChatsView';
import { ProfileView } from './components/ProfileView';
import { VideoCallOverlay } from './components/VideoCallOverlay';
import { SafetyModal } from './components/SafetyModal';
import { Avatar } from './components/Avatar';
import { PWAInstallButton } from './components/PWAInstallButton';

type NavTab = 'discover' | 'matches' | 'chats' | 'profile';
type ThemeMode = 'dark' | 'light';

interface SafetyPromptState {
  mode: 'block' | 'report';
  targetUid: string;
  targetName: string;
  matchId?: string;
}

const TAB_TITLES: Record<NavTab, string> = {
  discover: 'Discover',
  matches: 'Matches',
  chats: 'Messages',
  profile: 'Profile',
};

function getInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem('skillswipe_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage restriction
  }
  return 'dark';
}

function SkillSwipeApp() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [accountLoaded, setAccountLoaded] = useState(false);

  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
  const [allVisibleSkills, setAllVisibleSkills] = useState<UserSkill[]>([]);
  const [mySwipes, setMySwipes] = useState<SwipeRecord[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [calls, setCalls] = useState<VideoCallRecord[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [mySkillsLoaded, setMySkillsLoaded] = useState(false);
  const seededProfilesForUidRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('discover');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [outgoingCallMatch, setOutgoingCallMatch] = useState<MatchRecord | null>(null);
  const [dismissedCallIds, setDismissedCallIds] = useState<Set<string>>(new Set());
  const [safetyPrompt, setSafetyPrompt] = useState<SafetyPromptState | null>(null);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  // Sync Tailwind v4 .dark class on <html> and browser status bar theme-color
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', theme === 'dark' ? '#080B14' : '#F4F6FC');
    }
    try {
      window.localStorage.setItem('skillswipe_theme', theme);
    } catch {
      // Ignore storage restriction
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (!firebaseUser) {
        setPrivateUser(null);
        setPublicProfile(null);
        setMySkills([]);
        setAllVisibleSkills([]);
        setMySwipes([]);
        setMatches([]);
        setBlocks([]);
        setCalls([]);
        setSelectedMatchId(null);
        setOutgoingCallMatch(null);
        setMySkillsLoaded(false);
        seededProfilesForUidRef.current = null;
        setAccountLoaded(true);
        return;
      }

      setAccountLoaded(false);
      try {
        await ensureInitialPrivateRecord(firebaseUser);
        const state = await fetchUserAccountState(firebaseUser.uid);
        setPrivateUser(state.privateUser);
        setPublicProfile(state.publicProfile);
        void seedSkillCatalogIfAdmin(firebaseUser);
      } finally {
        setAccountLoaded(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshAccountState = useCallback(async () => {
    if (!user) return;
    const state = await fetchUserAccountState(user.uid);
    setPrivateUser(state.privateUser);
    setPublicProfile(state.publicProfile);
  }, [user]);

  const onboardingComplete = Boolean(
    privateUser?.onboardingComplete &&
      privateUser?.ageConfirmed18Plus &&
      privateUser?.termsAccepted &&
      publicProfile
  );

  useEffect(() => {
    if (!user || !onboardingComplete) return;
    const uid = user.uid;
    setSkillsLoaded(false);
    setMySkillsLoaded(false);

    const unsubPrivate = onSnapshot(
      doc(db, 'privateUsers', uid),
      (snap) => {
        if (snap.exists()) setPrivateUser(snap.data() as PrivateUser);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `privateUsers/${uid}`)
    );

    const unsubProfile = onSnapshot(
      doc(db, 'publicProfiles', uid),
      (snap) => {
        if (snap.exists()) setPublicProfile(snap.data() as PublicProfile);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `publicProfiles/${uid}`)
    );

    const unsubMySkills = onSnapshot(
      query(collection(db, 'userSkills'), where('uid', '==', uid)),
      (snap) => {
        setMySkills(snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserSkill) })));
        setMySkillsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `userSkills?uid=${uid}`)
    );

    const unsubDiscoverSkills = onSnapshot(
      query(collection(db, 'userSkills'), where('visible', '==', true)),
      (snap) => {
        setAllVisibleSkills(snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserSkill) })));
        setSkillsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'userSkills?visible=true')
    );

    const unsubSwipes = onSnapshot(
      query(collection(db, 'swipes'), where('actorUid', '==', uid)),
      (snap) => {
        setMySwipes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SwipeRecord) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `swipes?actorUid=${uid}`)
    );

    const unsubMatches = onSnapshot(
      query(collection(db, 'matches'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        setMatches(snap.docs.map((d) => d.data() as MatchRecord));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `matches?participant=${uid}`)
    );

    const unsubBlocks = onSnapshot(
      query(collection(db, 'blocks'), where('blockerUid', '==', uid)),
      (snap) => {
        setBlocks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as BlockRecord) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `blocks?blockerUid=${uid}`)
    );

    const unsubCalls = onSnapshot(
      query(collection(db, 'calls'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        setCalls(snap.docs.map((d) => d.data() as VideoCallRecord));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `calls?participant=${uid}`)
    );

    return () => {
      unsubPrivate();
      unsubProfile();
      unsubMySkills();
      unsubDiscoverSkills();
      unsubSwipes();
      unsubMatches();
      unsubBlocks();
      unsubCalls();
    };
  }, [user, onboardingComplete]);

  useEffect(() => {
    if (!user || !onboardingComplete || !mySkillsLoaded) return;
    if (seededProfilesForUidRef.current === user.uid) return;
    seededProfilesForUidRef.current = user.uid;

    const primarySkill = mySkills[0]
      ? { skillId: mySkills[0].skillId, skillName: mySkills[0].skillName }
      : undefined;

    void seedDemoProfilesIfAdmin(user, primarySkill).catch((err) => {
      console.error('Demo profile seeding error:', err);
      seededProfilesForUidRef.current = null;
    });
  }, [user, onboardingComplete, mySkillsLoaded, mySkills]);

  const blockedUids = useMemo(() => new Set(blocks.map((b) => b.blockedUid)), [blocks]);

  const activeMatches = useMemo(
    () => matches.filter((m) => m.status === 'active'),
    [matches]
  );

  const totalUnreadCount = useMemo(() => {
    if (!user) return 0;
    return activeMatches.reduce((sum, m) => {
      return sum + getMatchPeerView(m, user.uid).unreadCount;
    }, 0);
  }, [activeMatches, user]);

  const incomingRingingCall = useMemo(() => {
    if (!user || outgoingCallMatch) return null;
    return (
      calls.find(
        (c) =>
          c.recipientUid === user.uid &&
          c.status === 'ringing' &&
          !dismissedCallIds.has(c.callId) &&
          !blockedUids.has(c.initiatorUid)
      ) ?? null
    );
  }, [calls, user, outgoingCallMatch, dismissedCallIds, blockedUids]);

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleOpenChat = (match: MatchRecord) => {
    setSelectedMatchId(match.matchId);
    setActiveTab('chats');
  };

  const handleStartCall = (match: MatchRecord) => {
    if (match.status !== 'active') return;
    setOutgoingCallMatch(match);
  };

  const handleConfirmBlock = async () => {
    if (!user || !safetyPrompt) return;
    const sharedMatches = activeMatches.filter((m) =>
      m.participantIds.includes(safetyPrompt.targetUid)
    );
    await blockUserAndRevokeMatches({
      blockerUid: user.uid,
      blockedUid: safetyPrompt.targetUid,
      blockedName: safetyPrompt.targetName,
      activeMatchesWithUser: sharedMatches,
    });
    if (selectedMatchId && sharedMatches.some((m) => m.matchId === selectedMatchId)) {
      setSelectedMatchId(null);
    }
  };

  const handleConfirmReport = async (
    reason: ReportReason,
    details: string,
    alsoBlock: boolean
  ) => {
    if (!user || !safetyPrompt) return;
    await submitSafetyReport({
      reporterUid: user.uid,
      targetUid: safetyPrompt.targetUid,
      matchId: safetyPrompt.matchId,
      reason,
      details,
    });
    if (alsoBlock) {
      await handleConfirmBlock();
    }
  };

  if (!authReady || (user && !accountLoaded)) {
    return (
      <div className="min-h-screen bg-[#090C15] text-white flex flex-col items-center justify-center p-6">
        <div className="font-display text-3xl font-extrabold tracking-tight">
          <span>Skill</span>
          <span className="text-[#8DF0D4]">Swipe.</span>
        </div>
        <p className="mt-3 text-sm text-white/55">Loading your skill exchange...</p>
      </div>
    );
  }

  if (!user) {
    return <WelcomeScreen />;
  }

  if (!onboardingComplete || !publicProfile || !privateUser) {
    return (
      <OnboardingFlow
        user={user}
        onComplete={refreshAccountState}
        onSignOut={handleSignOut}
      />
    );
  }

  const navItems: {
    id: NavTab;
    label: string;
    icon: typeof Compass;
    badge?: number;
  }[] = [
    { id: 'discover', label: 'Discover', icon: Compass },
    { id: 'matches', label: 'Matches', icon: HeartHandshake, badge: activeMatches.length || undefined },
    { id: 'chats', label: 'Messages', icon: MessageSquare, badge: totalUnreadCount || undefined },
    { id: 'profile', label: 'Profile', icon: UserIcon },
  ];

  return (
    <div className="min-h-screen app-ambient-canvas text-[#161F3B] dark:text-[#F3F6FF] flex flex-col lg:flex-row relative transition-colors duration-200">
      {/* Sleek Desktop Navigation Rail */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[252px] lg:shrink-0 bg-white/75 dark:bg-[#0C1120]/82 backdrop-blur-2xl border-r border-[#161F3B]/[0.06] dark:border-white/[0.07] sticky top-0 h-screen justify-between p-5 z-20">
        <div className="space-y-8">
          <div className="px-1 pt-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                aria-hidden="true"
                className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7C5CFF] via-[#6544F0] to-[#46C9A9] text-white flex items-center justify-center shadow-md shadow-[#7C5CFF]/25 ring-1 ring-inset ring-white/25"
              >
                <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="font-display text-xl font-extrabold tracking-tight whitespace-nowrap">
                <span className="text-[#161F3B] dark:text-white">Skill</span>
                <span className="text-[#7C5CFF] dark:text-[#8DF0D4]">Swipe</span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-8 h-8 rounded-full bg-[#F5F7FC] dark:bg-white/[0.07] border border-[#161F3B]/[0.05] dark:border-white/[0.07] text-[#161F3B]/70 dark:text-white/75 hover:text-[#161F3B] dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          <nav aria-label="Primary navigation" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative w-full h-11 px-3.5 rounded-xl flex items-center justify-between text-[13px] font-semibold transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'text-white'
                      : 'text-[#161F3B]/65 dark:text-white/60 hover:bg-[#161F3B]/[0.04] dark:hover:bg-white/[0.06] hover:text-[#161F3B] dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="desktop-nav-active"
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] shadow-md shadow-[#7C5CFF]/25"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-2.5">
                    <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`relative z-10 text-[11px] font-mono-tabular font-bold px-2 py-0.5 rounded-full ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-[#7C5CFF]/15 text-[#7C5CFF] dark:bg-[#8DF0D4]/15 dark:text-[#8DF0D4]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2.5">
          <PWAInstallButton variant="sidebar" />
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="w-full rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.05] hover:bg-[#EAEFF9] dark:hover:bg-white/[0.09] border border-transparent dark:border-white/[0.06] p-3 flex items-center gap-3 text-left transition-colors cursor-pointer"
          >
            <Avatar
              name={publicProfile.displayName}
              photoUrl={publicProfile.photoUrl}
              size="sm"
              tone="midnight"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#161F3B] dark:text-white truncate">
                {publicProfile.displayName}
              </div>
              <div className="text-[11px] text-[#161F3B]/55 dark:text-white/55 truncate">
                {mySkills[0]?.skillName || 'Set up your skill'}
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Compact Frosted Mobile Top Bar (52px) */}
        <header className="lg:hidden sticky top-0 z-30 h-[52px] bg-[#F4F6FC]/78 dark:bg-[#080B14]/78 backdrop-blur-2xl border-b border-[#161F3B]/[0.05] dark:border-white/[0.06] px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              aria-hidden="true"
              className="w-7 h-7 rounded-[10px] bg-gradient-to-br from-[#7C5CFF] via-[#6544F0] to-[#46C9A9] text-white flex items-center justify-center shadow-sm shadow-[#7C5CFF]/25 ring-1 ring-inset ring-white/25"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div className="font-display text-[17px] font-extrabold tracking-tight whitespace-nowrap">
              <span className="text-[#161F3B] dark:text-white">Skill</span>
              <span className="text-[#7C5CFF] dark:text-[#8DF0D4]">Swipe</span>
            </div>
          </div>

          <span className="font-display text-xs font-semibold text-[#161F3B]/60 dark:text-white/60 tracking-wide">
            {TAB_TITLES[activeTab]}
          </span>

          <div className="flex items-center gap-2">
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 rounded-full bg-white/80 dark:bg-white/[0.07] border border-[#161F3B]/[0.06] dark:border-white/[0.08] flex items-center justify-center text-[#161F3B]/75 dark:text-white/80 hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        {/* Honest Offline Banner */}
        {isOffline && (
          <div
            role="status"
            className="bg-[#161F3B] dark:bg-[#1A2138] text-white px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
          >
            <WifiOff className="w-3.5 h-3.5 text-[#F26E7E]" aria-hidden="true" />
            <span>You are offline. Messages can be retried once reconnected.</span>
          </div>
        )}

        {/* Active Screen Viewport */}
        <main className="flex-1 pb-24 lg:pb-6">
          <motion.div
            key={activeTab}
            initial={privateUser.reducedMotion ? undefined : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'discover' && (
              <DiscoverView
                profile={publicProfile}
                mySkills={mySkills}
                allVisibleSkills={allVisibleSkills}
                mySwipes={mySwipes}
                blockedUids={blockedUids}
                activeMatches={activeMatches}
                reducedMotion={privateUser.reducedMotion}
                loading={!skillsLoaded}
                onOpenChat={handleOpenChat}
                onGoToProfile={() => setActiveTab('profile')}
                onRequestSafetyAction={(mode, targetUid, targetName) =>
                  setSafetyPrompt({ mode, targetUid, targetName })
                }
              />
            )}

            {activeTab === 'matches' && (
              <MatchesView
                currentUid={user.uid}
                matches={matches}
                onOpenChat={handleOpenChat}
                onStartCall={handleStartCall}
                onGoToDiscover={() => setActiveTab('discover')}
                onRequestSafetyAction={(mode, targetUid, targetName, matchId) =>
                  setSafetyPrompt({ mode, targetUid, targetName, matchId })
                }
              />
            )}

            {activeTab === 'chats' && (
              <ChatsView
                currentUid={user.uid}
                matches={matches}
                selectedMatchId={selectedMatchId}
                onSelectMatch={setSelectedMatchId}
                onStartCall={handleStartCall}
                onRequestSafetyAction={(mode, targetUid, targetName, matchId) =>
                  setSafetyPrompt({ mode, targetUid, targetName, matchId })
                }
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                user={user}
                profile={publicProfile}
                privateUser={privateUser}
                mySkills={mySkills}
                blocks={blocks}
                activeMatches={activeMatches}
                onSignOut={handleSignOut}
              />
            )}
          </motion.div>
        </main>
      </div>

      {/* Floating Liquid-Glass Mobile Pill Navigation Dock */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-2.5 left-4 right-4 z-40 pb-safe pointer-events-none"
      >
        <div className="pointer-events-auto max-w-[360px] mx-auto rounded-full glass-dock px-1.5 py-1 grid grid-cols-4 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative h-11 rounded-full flex flex-col items-center justify-center transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'text-white'
                    : 'text-[#161F3B]/50 dark:text-white/50 hover:text-[#161F3B] dark:hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-dock-active"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#6142E6] shadow-sm shadow-[#7C5CFF]/30"
                  />
                )}
                <div className="relative z-10">
                  <Icon
                    className={`w-[17px] h-[17px] ${active ? 'stroke-[2.25]' : 'stroke-[1.9]'}`}
                    aria-hidden="true"
                  />
                  {item.id === 'chats' && totalUnreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-1 rounded-full bg-[#F26E7E] text-white text-[9px] font-bold font-mono-tabular flex items-center justify-center">
                      {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                    </span>
                  )}
                  {item.id === 'matches' && activeMatches.length > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-1 rounded-full bg-[#8DF0D4] text-[#0B3D30] text-[9px] font-bold font-mono-tabular flex items-center justify-center">
                      {activeMatches.length > 9 ? '9+' : activeMatches.length}
                    </span>
                  )}
                </div>
                <span className="relative z-10 text-[9.5px] font-semibold mt-0.5 leading-none tracking-tight">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Global 1:1 WebRTC Video Call Overlay */}
      {(outgoingCallMatch || incomingRingingCall) && (
        <VideoCallOverlay
          currentUid={user.uid}
          currentName={publicProfile.displayName}
          outgoingTarget={outgoingCallMatch}
          incomingCall={incomingRingingCall}
          onClose={() => {
            if (incomingRingingCall) {
              setDismissedCallIds((prev) => {
                const next = new Set(prev);
                next.add(incomingRingingCall.callId);
                return next;
              });
            }
            setOutgoingCallMatch(null);
          }}
        />
      )}

      {/* Global Block / Report Safety Modal */}
      {safetyPrompt && (
        <SafetyModal
          mode={safetyPrompt.mode}
          targetName={safetyPrompt.targetName}
          onClose={() => setSafetyPrompt(null)}
          onConfirmBlock={handleConfirmBlock}
          onConfirmReport={handleConfirmReport}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SkillSwipeApp />
    </ErrorBoundary>
  );
}
