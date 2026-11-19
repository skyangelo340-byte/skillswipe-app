import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  AVAILABILITY_PRESETS,
  LANGUAGES_LIST,
  LIMITS,
  SKILL_CATALOG,
  formatSkillLevel,
  type SkillLevel,
  type SkillRole,
} from '../types/skillswipe';
import { completeUserOnboarding, type SkillDraftInput } from '../lib/skillswipeService';
import { Avatar } from './Avatar';

interface OnboardingFlowProps {
  user: User;
  onComplete: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function OnboardingFlow({ user, onComplete, onSignOut }: OnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [displayName, setDisplayName] = useState(
    (user.displayName || '').trim().slice(0, LIMITS.DISPLAY_NAME_MAX)
  );
  const [ageConfirmed18Plus, setAgeConfirmed18Plus] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  const [skillQuery, setSkillQuery] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<SkillDraftInput[]>([]);
  const [draftSkillId, setDraftSkillId] = useState<string>('guitar');
  const [draftLevel, setDraftLevel] = useState<SkillLevel>('intermediate');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftAvailability, setDraftAvailability] = useState('Weekends');

  const [bio, setBio] = useState('');
  const [availability, setAvailability] = useState('Weekends');
  const [useGooglePhoto, setUseGooglePhoto] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCatalog = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return SKILL_CATALOG;
    return SKILL_CATALOG.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [skillQuery]);

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) => {
      if (prev.includes(lang)) {
        return prev.length > 1 ? prev.filter((l) => l !== lang) : prev;
      }
      if (prev.length >= LIMITS.LANGUAGES_MAX) return prev;
      return [...prev, lang];
    });
  };

  const handleAddSkill = () => {
    const item = SKILL_CATALOG.find((s) => s.skillId === draftSkillId);
    if (!item) return;
    setError(null);
    setSelectedSkills((prev) => {
      const existsIdx = prev.findIndex((s) => s.skillId === item.skillId);
      const nextItem: SkillDraftInput = {
        skillId: item.skillId,
        skillName: item.name,
        role: 'mentor',
        level: draftLevel,
        description: draftDescription.trim().slice(0, LIMITS.SKILL_DESC_MAX),
        availability: draftAvailability.trim().slice(0, LIMITS.AVAILABILITY_MAX) || availability,
      };
      if (existsIdx >= 0) {
        const copy = [...prev];
        copy[existsIdx] = nextItem;
        return copy;
      }
      return [...prev, nextItem];
    });
    setDraftDescription('');
  };

  const handleRemoveSkill = (skillId: string, role: SkillRole) => {
    setSelectedSkills((prev) =>
      prev.filter((s) => !(s.skillId === skillId && s.role === role))
    );
  };

  const validateStep1 = (): boolean => {
    if (displayName.trim().length < LIMITS.DISPLAY_NAME_MIN) {
      setError('Enter a display name of at least 2 characters.');
      return false;
    }
    if (!ageConfirmed18Plus) {
      setError('You must confirm you are 18 or older to use SkillSwipe.');
      return false;
    }
    if (!termsAccepted) {
      setError('Please accept the community and privacy guidelines to continue.');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = (): boolean => {
    if (selectedSkills.length === 0) {
      setError('Add at least one skill you can share before continuing.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleFinish = async () => {
    if (!validateStep1() || !validateStep2()) return;
    setSubmitting(true);
    setError(null);
    try {
      await completeUserOnboarding({
        user,
        displayName,
        bio,
        useGooglePhoto,
        languages,
        timezone,
        availability,
        skills: selectedSkills,
        ageConfirmed18Plus,
        termsAccepted,
      });
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your onboarding profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase =
    'w-full rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] border border-transparent dark:border-white/[0.06] text-sm text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50 focus:bg-white dark:focus:bg-[#1A2238] transition-colors';

  return (
    <div className="min-h-screen bg-[#F5F7FC] dark:bg-[#090C15] text-[#161F3B] dark:text-white flex flex-col">
      <header className="sticky top-0 z-30 bg-[#F5F7FC]/85 dark:bg-[#090C15]/85 backdrop-blur-xl border-b border-[#161F3B]/6 dark:border-white/[0.08]">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <div className="font-display text-lg font-extrabold tracking-tight">
            <span>Skill</span>
            <span className="text-[#6D52DC] dark:text-[#9D85FF]">Swipe.</span>
          </div>
          <div className="text-xs font-semibold text-[#161F3B]/60 dark:text-white/55 font-mono-tabular">
            Step {step} of 3
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[40px] px-3.5 rounded-full text-xs font-semibold text-[#161F3B]/65 dark:text-white/65 hover:text-[#161F3B] dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.08] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign out
          </button>
        </div>
        <div className="h-1 bg-[#161F3B]/6 dark:bg-white/[0.08]">
          <div
            className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#9CE7D3] transition-all duration-200 rounded-r-full"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-5 py-8 pb-28">
        {step === 1 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#161F3B] dark:text-white">
                Set up your profile
              </h1>
              <p className="mt-2 text-sm text-[#161F3B]/65 dark:text-white/60 leading-relaxed">
                Confirm eligibility and choose how peers see you. Your email ({user.email}) stays strictly private.
              </p>
            </div>

            <div className="rounded-[32px] bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] p-6 sm:p-8 app-card-shadow space-y-6">
              <div>
                <label
                  htmlFor="onb-name"
                  className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
                >
                  Display name
                </label>
                <input
                  id="onb-name"
                  type="text"
                  value={displayName}
                  maxLength={LIMITS.DISPLAY_NAME_MAX}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How peers should address you"
                  className={`${inputBase} min-h-[46px] px-4`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="onb-tz"
                    className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
                  >
                    Timezone (online-only)
                  </label>
                  <input
                    id="onb-tz"
                    type="text"
                    value={timezone}
                    maxLength={LIMITS.TIMEZONE_MAX}
                    onChange={(e) => setTimezone(e.target.value)}
                    className={`${inputBase} min-h-[46px] px-4`}
                  />
                </div>
                <div>
                  <label
                    htmlFor="onb-avail"
                    className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
                  >
                    Typical availability
                  </label>
                  <select
                    id="onb-avail"
                    value={availability}
                    onChange={(e) => {
                      setAvailability(e.target.value);
                      setDraftAvailability(e.target.value);
                    }}
                    className={`${inputBase} min-h-[46px] px-4`}
                  >
                    {AVAILABILITY_PRESETS.map((preset) => (
                      <option
                        key={preset}
                        value={preset}
                        className="bg-white dark:bg-[#13192B] text-[#161F3B] dark:text-white"
                      >
                        {preset}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-2">
                  Languages you speak
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGES_LIST.map((lang) => {
                    const active = languages.includes(lang);
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => toggleLanguage(lang)}
                        className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#161F3B] dark:bg-[#7C5CFF] text-white'
                            : 'bg-[#F5F7FC] dark:bg-white/[0.07] text-[#161F3B]/70 dark:text-white/70 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.14]'
                        }`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[#161F3B]/8 dark:border-white/[0.08] space-y-3">
                <label className="flex items-start gap-3 rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ageConfirmed18Plus}
                    onChange={(e) => setAgeConfirmed18Plus(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#7C5CFF]"
                  />
                  <span className="text-sm text-[#161F3B] dark:text-white leading-snug">
                    <span className="font-semibold">I confirm I am 18 years or older.</span>{' '}
                    <span className="text-[#161F3B]/65 dark:text-white/60">
                      Explicit confirmation is required for peer video sessions.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#7C5CFF]"
                  />
                  <span className="text-sm text-[#161F3B] dark:text-white leading-snug">
                    <span className="font-semibold">
                      I accept SkillSwipe&apos;s Privacy & Community Guidelines.
                    </span>{' '}
                    <span className="text-[#161F3B]/65 dark:text-white/60">
                      Respectful educational exchange only; zero tolerance for harassment or misuse.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-5">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#161F3B] dark:text-white">
                  What skills can you share?
                </h1>
                <p className="mt-1.5 text-sm text-[#161F3B]/65 dark:text-white/60">
                  Add at least one skill you can teach. When you and another peer both swipe right, you match to trade skills.
                </p>
              </div>

              <div className="rounded-[32px] bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] p-6 app-card-shadow space-y-5">
                <div>
                  <div className="relative">
                    <Search
                      className="w-4 h-4 text-[#161F3B]/40 dark:text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={skillQuery}
                      onChange={(e) => setSkillQuery(e.target.value)}
                      placeholder="Search skills (guitar, Python, Spanish, design...)"
                      className="w-full min-h-[44px] rounded-full bg-[#F5F7FC] dark:bg-white/[0.06] pl-10 pr-4 text-sm text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50 focus:bg-white dark:focus:bg-[#1A2238] transition-colors"
                    />
                  </div>

                  <div className="mt-3 max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 pr-1">
                    {filteredCatalog.map((skill) => {
                      const active = draftSkillId === skill.skillId;
                      return (
                        <button
                          key={skill.skillId}
                          type="button"
                          onClick={() => setDraftSkillId(skill.skillId)}
                          className={`min-h-[48px] px-3.5 py-2 rounded-2xl text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#6D52DC]/12 dark:bg-[#7C5CFF]/22 ring-1 ring-[#6D52DC] dark:ring-[#7C5CFF] text-[#161F3B] dark:text-white font-bold'
                              : 'bg-[#F5F7FC] dark:bg-white/[0.06] text-[#161F3B]/80 dark:text-white/80 hover:bg-[#ECEFF8] dark:hover:bg-white/[0.11] font-medium'
                          }`}
                        >
                          <div className="truncate">{skill.name}</div>
                          <div className="text-[11px] text-[#161F3B]/50 dark:text-white/45 mt-0.5 font-normal">
                            {skill.category}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-2">
                    Your skill level
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['beginner', 'intermediate', 'advanced'] as SkillLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setDraftLevel(lvl)}
                        className={`min-h-[42px] rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                          draftLevel === lvl
                            ? 'bg-[#161F3B] dark:bg-[#7C5CFF] text-white'
                            : 'bg-[#F5F7FC] dark:bg-white/[0.07] text-[#161F3B]/75 dark:text-white/75 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.14]'
                        }`}
                      >
                        {formatSkillLevel(lvl)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="onb-skill-desc"
                    className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
                  >
                    How you can help someone learn this skill
                  </label>
                  <textarea
                    id="onb-skill-desc"
                    rows={2}
                    maxLength={LIMITS.SKILL_DESC_MAX}
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    placeholder="e.g., Patient step-by-step chord transitions and rhythm practice for beginners."
                    className={`${inputBase} px-4 py-3`}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="w-full min-h-[46px] rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:brightness-110 shadow-md shadow-[#6D52DC]/25 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add skill to my profile
                </button>
              </div>
            </div>

            <aside className="lg:col-span-5 rounded-[32px] bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] p-6 app-card-shadow space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-extrabold text-[#161F3B] dark:text-white">
                  Your skills
                </h2>
                <span className="text-xs text-[#161F3B]/55 dark:text-white/50 font-mono-tabular">
                  {selectedSkills.length} added
                </span>
              </div>

              {selectedSkills.length === 0 ? (
                <div className="rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] p-5 text-sm text-[#161F3B]/65 dark:text-white/60 leading-relaxed">
                  Pick a skill on the left and tap{' '}
                  <span className="font-semibold text-[#161F3B] dark:text-white">
                    Add skill to my profile
                  </span>
                  .
                </div>
              ) : (
                <ul className="divide-y divide-[#161F3B]/6 dark:divide-white/[0.08]">
                  {selectedSkills.map((item) => (
                    <li
                      key={`${item.skillId}_${item.role}`}
                      className="py-3.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#161F3B] dark:text-white">
                          {item.skillName}
                        </div>
                        <div className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                          {formatSkillLevel(item.level)} · {item.availability}
                        </div>
                        {item.description && (
                          <p className="text-xs text-[#161F3B]/70 dark:text-white/65 mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(item.skillId, item.role)}
                        aria-label={`Remove ${item.skillName}`}
                        className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-[#161F3B]/40 dark:text-white/40 hover:text-[#C94858] dark:hover:text-[#FF8594] hover:bg-[#F26E7E]/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#161F3B] dark:text-white">
                Bio & privacy defaults
              </h1>
              <p className="mt-2 text-sm text-[#161F3B]/65 dark:text-white/60">
                Initials avatars are used by default so discovery focuses on skills and teaching style.
              </p>
            </div>

            <div className="rounded-[32px] bg-white dark:bg-[#13192B] border border-[#161F3B]/[0.06] dark:border-white/[0.08] p-6 sm:p-8 app-card-shadow space-y-6">
              <div className="flex items-center gap-4">
                <Avatar
                  name={displayName || 'User'}
                  photoUrl={useGooglePhoto ? user.photoURL || '' : ''}
                  size="lg"
                  tone="midnight"
                />
                <div className="min-w-0">
                  <div className="font-display text-lg font-extrabold text-[#161F3B] dark:text-white truncate">
                    {displayName}
                  </div>
                  <div className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                    {languages.join(', ')} · {timezone}
                  </div>
                </div>
              </div>

              {user.photoURL && (
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] p-4">
                  <div>
                    <div className="text-sm font-semibold text-[#161F3B] dark:text-white">
                      Show my Google profile photo
                    </div>
                    <div className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                      Optional opt-in. Leave off to keep the default initials avatar.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useGooglePhoto}
                    aria-label="Show my Google profile photo"
                    onClick={() => setUseGooglePhoto((v) => !v)}
                    className={`relative w-12 h-7 rounded-full transition-colors shrink-0 cursor-pointer ${
                      useGooglePhoto ? 'bg-[#7C5CFF]' : 'bg-[#161F3B]/15 dark:bg-white/15'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                        useGooglePhoto ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}

              <div>
                <label
                  htmlFor="onb-bio"
                  className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
                >
                  Short bio (optional)
                </label>
                <textarea
                  id="onb-bio"
                  rows={3}
                  maxLength={LIMITS.BIO_MAX}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share your learning style, hobbies, or what makes a great 1:1 session for you..."
                  className={`${inputBase} px-4 py-3`}
                />
                <div className="text-right text-[11px] text-[#161F3B]/45 dark:text-white/40 font-mono-tabular mt-1">
                  {bio.length}/{LIMITS.BIO_MAX}
                </div>
              </div>

              <div className="rounded-2xl bg-[#9CE7D3]/28 dark:bg-[#9CE7D3]/14 border border-transparent dark:border-[#9CE7D3]/25 p-4 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#0E4A3C] dark:text-[#8DF0D4] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs text-[#161F3B]/80 dark:text-white/80 leading-relaxed">
                  <span className="font-semibold text-[#161F3B] dark:text-white">
                    Privacy summary:
                  </span>{' '}
                  Your email stays private and is never shown on swipe cards. You can pause visibility, block, or delete your account anytime in Profile.
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="max-w-2xl mx-auto mt-5 rounded-2xl bg-[#F26E7E]/15 px-4 py-3 text-sm font-medium text-[#A83847] dark:text-[#FF8594]"
          >
            {error}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-[#0D1220]/90 backdrop-blur-xl border-t border-[#161F3B]/6 dark:border-white/[0.08] px-5 py-3 pb-safe">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((s) => (s === 3 ? 2 : 1));
              }}
              className="min-h-[48px] px-5 rounded-full bg-[#F5F7FC] dark:bg-white/[0.08] text-[#161F3B] dark:text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-[#E8ECF7] dark:hover:bg-white/[0.15] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && validateStep1()) setStep(2);
                else if (step === 2 && validateStep2()) setStep(3);
              }}
              className="min-h-[48px] px-7 rounded-full bg-[#161F3B] dark:bg-gradient-to-r dark:from-[#7C5CFF] dark:to-[#5E3FE8] text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-[#233159] dark:hover:brightness-110 transition-all cursor-pointer"
            >
              Continue
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={submitting}
              className="min-h-[48px] px-7 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-sm font-semibold inline-flex items-center gap-2 hover:brightness-110 shadow-lg shadow-[#6D52DC]/30 transition-all disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              {submitting ? 'Saving profile...' : 'Enter Discover'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
