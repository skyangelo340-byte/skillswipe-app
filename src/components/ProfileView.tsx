import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeftRight,
  Bell,
  Camera,
  Check,
  Clock,
  Eye,
  EyeOff,
  Globe,
  LogOut,
  Plus,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  UserPen,
  UserX,
  X,
} from 'lucide-react';
import {
  AVAILABILITY_PRESETS,
  LANGUAGES_LIST,
  LIMITS,
  SKILL_CATALOG,
  formatSkillLevel,
  type BlockRecord,
  type MatchRecord,
  type PrivateUser,
  type ProfileStatus,
  type ProfileVisibility,
  type PublicProfile,
  type SkillLevel,
  type UserSkill,
} from '../types/skillswipe';
import {
  deleteAccountAndCleanup,
  removeUserSkill,
  unblockUser,
  updatePrivatePreferences,
  updatePublicProfileAndSyncSkills,
  upsertUserSkill,
} from '../lib/skillswipeService';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileViewProps {
  user: User;
  profile: PublicProfile;
  privateUser: PrivateUser;
  mySkills: UserSkill[];
  blocks: BlockRecord[];
  activeMatches: MatchRecord[];
  onSignOut: () => Promise<void>;
}

type ProfileSectionTab = 'skills' | 'edit' | 'settings';

const SKILL_CATEGORY_BY_ID = new Map<string, string>(
  SKILL_CATALOG.map((item) => [item.skillId, item.category])
);

interface SwitchRowProps {
  title: string;
  subtitle: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  icon: React.ReactNode;
}

function SwitchRow({ title, subtitle, checked, disabled, onChange, icon }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-[#F4F6FC] dark:bg-white/[0.06] border border-[#161F3B]/[0.05] dark:border-white/[0.07] flex items-center justify-center shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#161F3B] dark:text-white leading-snug">
            {title}
          </div>
          <div className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5 leading-relaxed">
            {subtitle}
          </div>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-150 shrink-0 cursor-pointer disabled:opacity-50 ${
          checked ? 'bg-[#7C5CFF]' : 'bg-[#161F3B]/15 dark:bg-white/15'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-150 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function ProfileView({
  user,
  profile,
  privateUser,
  mySkills,
  blocks,
  activeMatches,
  onSignOut,
}: ProfileViewProps) {
  const [sectionTab, setSectionTab] = useState<ProfileSectionTab>('skills');

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [useGooglePhoto, setUseGooglePhoto] = useState(profile.useGooglePhoto);
  const [status, setStatus] = useState<ProfileStatus>(profile.status);
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile.visibility);
  const [languages, setLanguages] = useState<string[]>(profile.languages);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [availability, setAvailability] = useState(profile.availability);

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    privateUser.notificationsEnabled
  );
  const [reducedMotion, setReducedMotion] = useState(privateUser.reducedMotion);

  // Add / edit skill composer drawer state
  const [skillComposerOpen, setSkillComposerOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [addingSkillId, setAddingSkillId] = useState<string>('guitar');
  const [addingLevel, setAddingLevel] = useState<SkillLevel>('intermediate');
  const [addingDesc, setAddingDesc] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const [savingSkill, setSavingSkill] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const showToast = (text: string, tone: 'ok' | 'err' = 'ok') => {
    setFeedback({ text, tone });
  };

  const filteredCatalog = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    if (!q) return SKILL_CATALOG;
    return SKILL_CATALOG.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [skillSearch]);

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) => {
      if (prev.includes(lang)) {
        return prev.length > 1 ? prev.filter((l) => l !== lang) : prev;
      }
      if (prev.length >= LIMITS.LANGUAGES_MAX) return prev;
      return [...prev, lang];
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < LIMITS.DISPLAY_NAME_MIN) {
      showToast('Display name must be at least 2 characters.', 'err');
      return;
    }
    setSavingProfile(true);
    setFeedback(null);
    try {
      await updatePublicProfileAndSyncSkills({
        uid: profile.uid,
        googlePhotoUrl: user.photoURL || '',
        displayName,
        bio,
        useGooglePhoto,
        status,
        visibility,
        languages,
        timezone,
        availability,
        mySkills,
      });
      showToast('Profile details updated.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save profile.', 'err');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleInstantPublicToggle = async (next: {
    visibility?: ProfileVisibility;
    status?: ProfileStatus;
    useGooglePhoto?: boolean;
    message: string;
  }) => {
    const nextVis = next.visibility ?? visibility;
    const nextStatus = next.status ?? status;
    const nextPhoto = next.useGooglePhoto ?? useGooglePhoto;

    setVisibility(nextVis);
    setStatus(nextStatus);
    setUseGooglePhoto(nextPhoto);
    setSavingPref(true);

    try {
      await updatePublicProfileAndSyncSkills({
        uid: profile.uid,
        googlePhotoUrl: user.photoURL || '',
        displayName: displayName || profile.displayName,
        bio,
        useGooglePhoto: nextPhoto,
        status: nextStatus,
        visibility: nextVis,
        languages,
        timezone,
        availability,
        mySkills,
      });
      showToast(next.message);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update setting.', 'err');
    } finally {
      setSavingPref(false);
    }
  };

  const handleInstantPrivateToggle = async (next: {
    notificationsEnabled?: boolean;
    reducedMotion?: boolean;
    message: string;
  }) => {
    const nextNotif = next.notificationsEnabled ?? notificationsEnabled;
    const nextMotion = next.reducedMotion ?? reducedMotion;

    setNotificationsEnabled(nextNotif);
    setReducedMotion(nextMotion);
    setSavingPref(true);

    try {
      await updatePrivatePreferences(profile.uid, {
        notificationsEnabled: nextNotif,
        reducedMotion: nextMotion,
      });
      showToast(next.message);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update preference.', 'err');
    } finally {
      setSavingPref(false);
    }
  };

  const handleAddOrUpdateSkill = async () => {
    const item = SKILL_CATALOG.find((s) => s.skillId === addingSkillId);
    if (!item) return;
    setSavingSkill(true);
    setFeedback(null);
    try {
      await upsertUserSkill(profile, {
        skillId: item.skillId,
        skillName: item.name,
        role: 'mentor',
        level: addingLevel,
        description: addingDesc,
        availability: availability || profile.availability || 'Weekends',
      });
      setAddingDesc('');
      setSkillComposerOpen(false);
      showToast(`Saved "${item.name}" to your profile.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save skill.', 'err');
    } finally {
      setSavingSkill(false);
    }
  };

  const handleRemoveSkill = async (skill: UserSkill) => {
    if (mySkills.length <= 1) {
      showToast('Keep at least one skill on your profile so others can match with you.', 'err');
      return;
    }
    await removeUserSkill(profile.uid, skill.skillId, skill.role);
    showToast(`Removed ${skill.skillName}.`);
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteAccountAndCleanup(user, activeMatches);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Could not complete account deletion. Please try again after re-signing in.'
      );
      setDeletingAccount(false);
    }
  };

  const isDiscoverable = visibility === 'visible' && status === 'active';
  const primarySkill = mySkills[0] ?? null;

  const inputBase =
    'w-full rounded-2xl bg-[#F4F6FC] dark:bg-white/[0.06] border border-[#161F3B]/[0.05] dark:border-white/[0.07] text-sm text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50 focus:bg-white dark:focus:bg-[#1A2238] transition-colors';

  const sectionTabs: Array<{ id: ProfileSectionTab; label: string; icon: typeof Sparkles }> = [
    { id: 'skills', label: 'My Skills', icon: Sparkles },
    { id: 'edit', label: 'Edit Profile', icon: UserPen },
    { id: 'settings', label: 'Settings', icon: Settings2 },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-4 lg:py-7 space-y-5">
      {/* Compact Editorial Profile Hero Card */}
      <section className="rounded-[32px] glass-surface overflow-hidden">
        <div className="h-24 sm:h-28 bg-gradient-to-br from-[#131A35] via-[#2F2B7C] to-[#5E3FE8] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-10 w-60 h-60 rounded-full bg-[#8DF0D4]/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute left-1/4 -bottom-16 w-60 h-44 rounded-full bg-[#FF7B93]/20 blur-3xl"
          />

          {/* Floating Sign-out Action on Banner */}
          <div className="absolute top-3.5 right-3.5">
            <button
              type="button"
              onClick={onSignOut}
              className="h-8 px-3 rounded-full bg-black/28 hover:bg-black/45 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3 h-3" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>

        <div className="px-5 sm:px-6 pb-5 -mt-10 relative">
          <div className="flex items-end justify-between gap-3">
            <Avatar
              name={displayName || profile.displayName}
              photoUrl={useGooglePhoto ? user.photoURL || '' : ''}
              size="xl"
              tone="midnight"
              className="ring-4 ring-white dark:ring-[#12182A] shadow-lg"
            />
            <button
              type="button"
              onClick={() =>
                void handleInstantPublicToggle({
                  visibility: isDiscoverable ? 'hidden' : 'visible',
                  status: isDiscoverable ? 'paused' : 'active',
                  message: isDiscoverable
                    ? 'Discovery paused. Existing matches stay active.'
                    : 'You are now visible in Discover.',
                })
              }
              disabled={savingPref}
              className={`h-8 px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer border ${
                isDiscoverable
                  ? 'bg-[#8DF0D4]/22 dark:bg-[#8DF0D4]/14 border-[#145949]/15 dark:border-[#8DF0D4]/25 text-[#0E4A3C] dark:text-[#8DF0D4]'
                  : 'bg-[#F4F6FC] dark:bg-white/[0.07] border-[#161F3B]/[0.08] dark:border-white/[0.1] text-[#161F3B]/65 dark:text-white/65'
              }`}
            >
              {isDiscoverable ? (
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{isDiscoverable ? 'Visible in Discover' : 'Discovery paused'}</span>
            </button>
          </div>

          <div className="mt-3.5 space-y-1.5">
            <h1 className="font-display text-2xl font-extrabold text-[#161F3B] dark:text-white tracking-tight">
              {profile.displayName}
            </h1>
            {profile.bio && (
              <p className="text-sm text-[#161F3B]/70 dark:text-white/70 leading-relaxed max-w-2xl">
                {profile.bio}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#161F3B]/55 dark:text-white/50 pt-0.5">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" />
                {profile.availability} · {profile.timezone}
              </span>
              <span className="inline-flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" />
                {profile.languages.join(' · ')}
              </span>
            </div>
          </div>

          {/* Clean Unboxed Stats Strip */}
          <div className="mt-5 pt-4 border-t border-[#161F3B]/[0.06] dark:border-white/[0.08] grid grid-cols-3 gap-3">
            <div>
              <div className="text-lg sm:text-xl font-display font-extrabold font-mono-tabular text-[#161F3B] dark:text-white">
                {mySkills.length}
              </div>
              <div className="text-[11px] text-[#161F3B]/55 dark:text-white/50">Skills shared</div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-display font-extrabold font-mono-tabular text-[#161F3B] dark:text-white">
                {activeMatches.length}
              </div>
              <div className="text-[11px] text-[#161F3B]/55 dark:text-white/50">Active matches</div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-display font-extrabold text-[#145949] dark:text-[#8DF0D4] truncate">
                {primarySkill?.skillName || 'None'}
              </div>
              <div className="text-[11px] text-[#161F3B]/55 dark:text-white/50">Primary swap</div>
            </div>
          </div>
        </div>
      </section>

      {/* Inline Toast Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="status"
            className={`rounded-2xl px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-3 ${
              feedback.tone === 'err'
                ? 'bg-[#EF475A]/15 text-[#A83847] dark:text-[#FF8594] border border-[#EF475A]/20'
                : 'bg-[#8DF0D4]/30 dark:bg-[#8DF0D4]/14 text-[#0E4A3C] dark:text-[#8DF0D4] border border-[#145949]/15 dark:border-[#8DF0D4]/25'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss notification"
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Segmented Control Navigation */}
      <div
        role="tablist"
        aria-label="Profile sections"
        className="p-1 rounded-full glass-surface grid grid-cols-3 gap-1 max-w-md mx-auto"
      >
        {sectionTabs.map((tab) => {
          const Icon = tab.icon;
          const active = sectionTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSectionTab(tab.id)}
              className={`relative h-9 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                active
                  ? 'text-white'
                  : 'text-[#161F3B]/60 dark:text-white/60 hover:text-[#161F3B] dark:hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="profile-section-pill"
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] shadow-sm shadow-[#7C5CFF]/25"
                />
              )}
              <Icon className="relative z-10 w-3.5 h-3.5" aria-hidden="true" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      <AnimatePresence mode="wait">
        {sectionTab === 'skills' && (
          <motion.div
            key="skills"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="space-y-5"
          >
            {/* Header + Add Skill Action */}
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="font-display text-base font-extrabold text-[#161F3B] dark:text-white">
                  Skills you share
                </h2>
                <p className="text-xs text-[#161F3B]/55 dark:text-white/50">
                  Peers swipe right when they want to learn one of these from you.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSkillComposerOpen((open) => !open)}
                className="h-9 px-3.5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-110 shadow-sm shadow-[#7C5CFF]/25 transition-all shrink-0 cursor-pointer"
              >
                {skillComposerOpen ? (
                  <>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    Close
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Add skill
                  </>
                )}
              </button>
            </div>

            {/* Collapsible Modern Skill Picker Composer */}
            <AnimatePresence>
              {skillComposerOpen && (
                <motion.section
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-[28px] glass-surface p-5 space-y-4">
                    <div className="relative">
                      <Search
                        className="w-4 h-4 text-[#161F3B]/40 dark:text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={skillSearch}
                        onChange={(e) => setSkillSearch(e.target.value)}
                        placeholder="Search skills (guitar, React, photography, Japanese...)"
                        className="w-full h-10 rounded-full bg-[#F4F6FC] dark:bg-white/[0.06] pl-10 pr-4 text-xs text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50"
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 pr-1">
                      {filteredCatalog.map((skill) => {
                        const active = addingSkillId === skill.skillId;
                        return (
                          <button
                            key={skill.skillId}
                            type="button"
                            onClick={() => setAddingSkillId(skill.skillId)}
                            className={`px-3 py-2.5 rounded-2xl text-left text-xs transition-all cursor-pointer ${
                              active
                                ? 'bg-[#7C5CFF]/15 dark:bg-[#7C5CFF]/25 ring-1 ring-[#7C5CFF] text-[#161F3B] dark:text-white font-bold'
                                : 'bg-[#F4F6FC] dark:bg-white/[0.05] text-[#161F3B]/80 dark:text-white/80 hover:bg-[#E9EDF8] dark:hover:bg-white/[0.1] font-medium'
                            }`}
                          >
                            <div className="truncate">{skill.name}</div>
                            <div className="text-[10px] text-[#161F3B]/45 dark:text-white/45 mt-0.5 font-normal">
                              {skill.category}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-[#161F3B]/60 dark:text-white/55 mb-1.5">
                        Your level
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['beginner', 'intermediate', 'advanced'] as SkillLevel[]).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setAddingLevel(lvl)}
                            className={`h-9 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                              addingLevel === lvl
                                ? 'bg-[#161F3B] dark:bg-[#7C5CFF] text-white'
                                : 'bg-[#F4F6FC] dark:bg-white/[0.06] text-[#161F3B]/70 dark:text-white/70 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.12]'
                            }`}
                          >
                            {formatSkillLevel(lvl)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <input
                      type="text"
                      value={addingDesc}
                      maxLength={LIMITS.SKILL_DESC_MAX}
                      onChange={(e) => setAddingDesc(e.target.value)}
                      placeholder="Short note on how you can teach or practice this together..."
                      className={`${inputBase} h-10 px-4 text-xs`}
                    />

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSkillComposerOpen(false)}
                        className="h-9 px-4 rounded-full bg-[#F4F6FC] dark:bg-white/[0.07] text-xs font-semibold text-[#161F3B] dark:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingSkill}
                        onClick={handleAddOrUpdateSkill}
                        className="h-9 px-5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-60 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        {savingSkill ? 'Saving...' : 'Save skill'}
                      </button>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Skill Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {mySkills.map((sk, idx) => {
                const category = SKILL_CATEGORY_BY_ID.get(sk.skillId) || 'Skill Swap';
                return (
                  <article
                    key={`${sk.skillId}_${sk.role}`}
                    className="rounded-[24px] glass-surface p-5 flex flex-col justify-between gap-3.5 transition-all hover:border-[#7C5CFF]/30 dark:hover:border-[#7C5CFF]/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#7C5CFF] dark:text-[#8DF0D4]">
                          {category} · {formatSkillLevel(sk.level)}
                          {idx === 0 && ' · Primary'}
                        </div>
                        <h3 className="font-display text-lg font-extrabold text-[#161F3B] dark:text-white mt-0.5 truncate">
                          {sk.skillName}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleRemoveSkill(sk)}
                        aria-label={`Remove ${sk.skillName}`}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[#161F3B]/40 dark:text-white/40 hover:text-[#EF475A] dark:hover:text-[#FF8594] hover:bg-[#EF475A]/10 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    <p className="text-xs text-[#161F3B]/70 dark:text-white/70 leading-relaxed">
                      {sk.description ||
                        `Open to 1:1 ${sk.skillName.toLowerCase()} skill swap sessions.`}
                    </p>

                    <div className="pt-2.5 border-t border-[#161F3B]/[0.06] dark:border-white/[0.07] flex items-center justify-between text-[11px] text-[#161F3B]/50 dark:text-white/45">
                      <span className="inline-flex items-center gap-1">
                        <ArrowLeftRight className="w-3 h-3 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" />
                        Shown on Discover card
                      </span>
                      <span>{sk.availability}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </motion.div>
        )}

        {sectionTab === 'edit' && (
          <motion.form
            key="edit"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            onSubmit={handleSaveProfile}
            className="rounded-[28px] glass-surface p-6 space-y-5"
          >
            <div>
              <h2 className="font-display text-base font-extrabold text-[#161F3B] dark:text-white">
                Public profile details
              </h2>
              <p className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                Your email ({privateUser.email}) is strictly private and never shown to peers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="prof-name"
                  className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
                >
                  Display name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  value={displayName}
                  maxLength={LIMITS.DISPLAY_NAME_MAX}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={`${inputBase} h-11 px-4`}
                />
              </div>

              <div>
                <label
                  htmlFor="prof-tz"
                  className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
                >
                  Timezone
                </label>
                <input
                  id="prof-tz"
                  type="text"
                  value={timezone}
                  maxLength={LIMITS.TIMEZONE_MAX}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={`${inputBase} h-11 px-4`}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="prof-bio"
                  className="text-xs font-semibold text-[#161F3B]/65 dark:text-white/60"
                >
                  Public bio
                </label>
                <span className="text-[11px] font-mono-tabular text-[#161F3B]/45 dark:text-white/40">
                  {bio.length}/{LIMITS.BIO_MAX}
                </span>
              </div>
              <textarea
                id="prof-bio"
                rows={3}
                maxLength={LIMITS.BIO_MAX}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell peers about your style, background, or what you love learning..."
                className={`${inputBase} px-4 py-3`}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-2">
                Typical availability
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABILITY_PRESETS.map((preset) => {
                  const active = availability === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAvailability(preset)}
                      className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#161F3B] dark:bg-[#7C5CFF] text-white'
                          : 'bg-[#F4F6FC] dark:bg-white/[0.06] text-[#161F3B]/70 dark:text-white/70 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.12]'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-2">
                Languages ({languages.length}/{LIMITS.LANGUAGES_MAX})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES_LIST.map((lang) => {
                  const active = languages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggleLanguage(lang)}
                      className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#161F3B] dark:bg-[#7C5CFF] text-white'
                          : 'bg-[#F4F6FC] dark:bg-white/[0.06] text-[#161F3B]/70 dark:text-white/70 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.12]'
                      }`}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full sm:w-auto h-10 px-6 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.99] shadow-sm shadow-[#7C5CFF]/25 transition-all disabled:opacity-60 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                {savingProfile ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </motion.form>
        )}

        {sectionTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="space-y-5"
          >
            {/* In-App Install Card (auto-hides when already installed in standalone mode) */}
            <PWAInstallButton variant="card" />

            {/* Instant-Save Preferences Card */}
            <section className="rounded-[28px] glass-surface p-6">
              <div className="mb-4">
                <h2 className="font-display text-base font-extrabold text-[#161F3B] dark:text-white">
                  Preferences
                </h2>
                <p className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                  Changes save automatically when toggled.
                </p>
              </div>

              <div className="divide-y divide-[#161F3B]/[0.06] dark:divide-white/[0.07]">
                <SwitchRow
                  title="Visible in Discover"
                  subtitle="Pause discovery anytime while keeping existing matches active."
                  checked={isDiscoverable}
                  disabled={savingPref}
                  onChange={(checked) =>
                    void handleInstantPublicToggle({
                      visibility: checked ? 'visible' : 'hidden',
                      status: checked ? 'active' : 'paused',
                      message: checked
                        ? 'You are visible in Discover again.'
                        : 'Discovery paused.',
                    })
                  }
                  icon={
                    isDiscoverable ? (
                      <Eye className="w-4 h-4 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-[#161F3B]/50 dark:text-white/45" aria-hidden="true" />
                    )
                  }
                />

                {user.photoURL && (
                  <SwitchRow
                    title="Show Google profile photo"
                    subtitle="Off by default so you use a colorful initials avatar."
                    checked={useGooglePhoto}
                    disabled={savingPref}
                    onChange={(checked) =>
                      void handleInstantPublicToggle({
                        useGooglePhoto: checked,
                        message: checked
                          ? 'Google profile photo enabled.'
                          : 'Switched back to initials avatar.',
                      })
                    }
                    icon={
                      <Camera className="w-4 h-4 text-[#7C5CFF] dark:text-[#B4A3FF]" aria-hidden="true" />
                    }
                  />
                )}

                <SwitchRow
                  title="In-app match & call alerts"
                  subtitle="Show live alerts for new matches and incoming video calls."
                  checked={notificationsEnabled}
                  disabled={savingPref}
                  onChange={(checked) =>
                    void handleInstantPrivateToggle({
                      notificationsEnabled: checked,
                      message: checked ? 'In-app alerts enabled.' : 'In-app alerts muted.',
                    })
                  }
                  icon={
                    <Bell className="w-4 h-4 text-[#7C5CFF] dark:text-[#B4A3FF]" aria-hidden="true" />
                  }
                />

                <SwitchRow
                  title="Reduced motion"
                  subtitle="Disables card drag tilt and transition animations."
                  checked={reducedMotion}
                  disabled={savingPref}
                  onChange={(checked) =>
                    void handleInstantPrivateToggle({
                      reducedMotion: checked,
                      message: checked ? 'Reduced motion enabled.' : 'Full motion restored.',
                    })
                  }
                  icon={
                    <Sparkles className="w-4 h-4 text-[#7C5CFF] dark:text-[#B4A3FF]" aria-hidden="true" />
                  }
                />
              </div>
            </section>

            {/* Safety & Account Card */}
            <section className="rounded-[28px] glass-surface p-6 space-y-5">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" />
                <h2 className="font-display text-base font-extrabold text-[#161F3B] dark:text-white">
                  Safety & account
                </h2>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-2">
                  Blocked accounts ({blocks.length})
                </div>
                {blocks.length === 0 ? (
                  <p className="text-xs text-[#161F3B]/55 dark:text-white/50">
                    You have not blocked any users.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#161F3B]/[0.06] dark:divide-white/[0.08]">
                    {blocks.map((b) => (
                      <li
                        key={b.blockedUid}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <span className="text-sm font-medium text-[#161F3B] dark:text-white">
                          {b.blockedName || b.blockedUid}
                        </span>
                        <button
                          type="button"
                          onClick={() => void unblockUser(profile.uid, b.blockedUid)}
                          className="h-8 px-3.5 rounded-full bg-[#F4F6FC] dark:bg-white/[0.08] text-xs font-semibold text-[#161F3B] dark:text-white hover:bg-[#E8ECF7] dark:hover:bg-white/[0.15] cursor-pointer"
                        >
                          Unblock
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-4 border-t border-[#161F3B]/[0.08] dark:border-white/[0.08] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-[#B53D4C] dark:text-[#FF8594]">
                      Delete SkillSwipe account
                    </div>
                    <p className="text-[11px] text-[#161F3B]/55 dark:text-white/45 mt-0.5">
                      Signed in privately as {privateUser.email}
                    </p>
                  </div>

                  {!confirmDeleteOpen && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(true)}
                      className="h-9 px-4 rounded-full bg-[#EF475A]/12 dark:bg-[#EF475A]/15 text-[#A83847] dark:text-[#FF8594] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#EF475A]/22 transition-colors self-start sm:self-auto cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete account
                    </button>
                  )}
                </div>

                {confirmDeleteOpen && (
                  <div className="rounded-2xl bg-[#FFF4F5] dark:bg-[#EF475A]/12 border border-[#EF475A]/20 p-4 space-y-3">
                    <p className="text-xs text-[#161F3B] dark:text-white/85 leading-relaxed">
                      Deleting your account permanently removes your public profile, skills, swipe history, and unmatches active conversations. Your Google account is unaffected.
                    </p>
                    {deleteError && (
                      <p className="text-xs font-medium text-[#A83847] dark:text-[#FF8594]">
                        {deleteError}
                      </p>
                    )}
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={deletingAccount}
                        onClick={() => setConfirmDeleteOpen(false)}
                        className="flex-1 h-9 rounded-full bg-white dark:bg-white/10 text-xs font-semibold text-[#161F3B] dark:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={deletingAccount}
                        onClick={() => void handleDeleteAccount()}
                        className="flex-1 h-9 rounded-full bg-[#D94B5C] text-white text-xs font-semibold hover:bg-[#C13D4E] disabled:opacity-60 cursor-pointer"
                      >
                        {deletingAccount ? 'Deleting...' : 'Confirm deletion'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
