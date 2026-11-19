import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  Clock,
  Globe,
  Heart,
  Lock,
  MessageSquare,
  Video,
  X,
} from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';

const WELCOME_COVER = '/src/assets/images/skill_music_cover_1795121433466.jpg';

export function WelcomeScreen() {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);

  const handleGoogleSignIn = async () => {
    if (signingIn) return;
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Sign-in was canceled. No account or profile was created.');
      } else if (code === 'auth/network-request-failed') {
        setAuthError('You appear to be offline. Check your internet connection and try again.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Your browser blocked the Google Sign-In popup. Please allow popups for this site and try again.'
        );
      } else if (code === 'auth/user-disabled') {
        setAuthError('This Google account has been disabled for SkillSwipe.');
      } else {
        setAuthError('Could not complete Google Sign-In. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#101830] text-white flex flex-col relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-32 w-[500px] h-[500px] rounded-full bg-[#6D52DC]/20 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 right-0 w-[520px] h-[520px] rounded-full bg-[#9CE7D3]/12 blur-[140px]"
      />

      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-8">
        <div className="font-display text-2xl font-extrabold tracking-tight whitespace-nowrap shrink-0">
          <span className="text-white">Skill</span>
          <span className="text-[#9CE7D3]">Swipe.</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-white/65 hidden sm:flex items-center gap-2.5 whitespace-nowrap">
            <span>Two-way skill exchange</span>
            <span aria-hidden="true">·</span>
            <span>18+ learning community</span>
            <span aria-hidden="true">·</span>
            <span>100% free</span>
          </div>
          <PWAInstallButton variant="compact" />
        </div>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-6 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
        <section className="lg:col-span-7 space-y-7">
          <p className="text-sm font-medium text-[#9CE7D3] tracking-wide">
            Peer-to-peer skill swap · Not a dating app
          </p>

          <h1
            className="font-display font-extrabold tracking-tight text-white leading-[1.06] max-w-2xl"
            style={{ fontSize: 'clamp(2.35rem, 4.4vw, 3.75rem)', textWrap: 'balance' }}
          >
            Teach what you know. Learn what you love.
          </h1>

          <p className="text-base sm:text-lg text-white/75 leading-relaxed max-w-xl">
            List a skill you can share, swipe right on someone whose skill you want to learn, and match mutually when they want to learn yours too. Connect in private chat and 1:1 video sessions.
          </p>

          <div className="pt-1 max-w-md space-y-3.5">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full min-h-[56px] px-6 py-3.5 rounded-full bg-white text-[#141D38] font-display font-bold text-base flex items-center justify-center gap-3 shadow-xl shadow-black/25 hover:bg-[#F5F7FC] active:scale-[0.985] transition-all duration-150 disabled:opacity-70 cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>{signingIn ? 'Connecting with Google...' : 'Continue with Google'}</span>
              {!signingIn && (
                <ArrowRight className="w-4 h-4 ml-auto text-[#6D52DC]" aria-hidden="true" />
              )}
            </button>

            {authError && (
              <div
                role="alert"
                className="rounded-2xl bg-[#F26E7E]/15 border border-[#F26E7E]/30 px-4 py-3 text-sm text-[#FFD8DD] flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F26E7E]" aria-hidden="true" />
                <span>{authError}</span>
              </div>
            )}

            <p className="text-xs text-white/55 leading-relaxed">
              Your Google email stays private and is never shown on discovery cards. Age 18+ confirmation and skill setup follow sign-in.
            </p>
          </div>

          <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl text-xs text-white/75">
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-[#9CE7D3] shrink-0" aria-hidden="true" />
              <span>Mutual match required</span>
            </div>
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-[#C7B8FF] shrink-0" aria-hidden="true" />
              <span>Real-time 1:1 chat</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Video className="w-4 h-4 text-[#F8B4BD] shrink-0" aria-hidden="true" />
              <span>Direct 1:1 video calls</span>
            </div>
          </div>
        </section>

        {/* Right: Editorial Photo Showcase Card */}
        <aside className="lg:col-span-5 flex justify-center">
          <div className="relative w-full max-w-[390px]">
            <div
              aria-hidden="true"
              className="absolute inset-x-5 -bottom-4 top-5 rounded-[34px] bg-white/10 border border-white/10"
            />

            <div className="relative rounded-[34px] bg-white text-[#161F3B] overflow-hidden shadow-2xl shadow-black/45">
              <div className="relative h-[230px] bg-gradient-to-br from-[#2A1E52] via-[#3C2873] to-[#1D274C] text-white p-6 flex flex-col justify-between overflow-hidden">
                {!coverFailed && (
                  <img
                    src={WELCOME_COVER}
                    alt="Acoustic guitar craft atmosphere"
                    referrerPolicy="no-referrer"
                    onError={() => setCoverFailed(true)}
                    className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0E152B] via-[#0E152B]/60 to-[#0E152B]/25"
                />

                <div className="relative z-10 flex items-center justify-between text-xs text-[#9CE7D3] font-semibold">
                  <span>Music · Advanced</span>
                  <span className="text-white/75 font-normal">Asia/Manila</span>
                </div>

                <div className="relative z-10 space-y-3.5">
                  <div>
                    <div className="font-display text-2xl font-extrabold tracking-tight text-white">
                      Acoustic Guitar
                    </div>
                    <div className="text-xs text-white/80 mt-0.5">
                      Also shares: Singing & Vocals
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-3 border-t border-white/15">
                    <Avatar name="Mikael Santos" size="sm" tone="mint" />
                    <div>
                      <div className="font-display text-sm font-bold text-white">
                        Mikael Santos
                      </div>
                      <div className="text-[11px] text-white/75">Weekday evenings</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="rounded-2xl bg-[#F5F7FC] px-4 py-3 flex items-center gap-2.5 text-xs text-[#161F3B]">
                  <ArrowLeftRight className="w-4 h-4 text-[#6D52DC] shrink-0" aria-hidden="true" />
                  <span>
                    Swap <span className="font-bold">Your skill</span> with{' '}
                    <span className="font-bold">Guitar</span>
                  </span>
                </div>

                <p className="text-sm text-[#161F3B]/80 leading-relaxed">
                  Fingerstyle arrangements, barre chords, and rhythm strumming. Happy to teach in exchange for coding, design, or a new language.
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-[#161F3B]/8 text-xs text-[#161F3B]/65">
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[#6D52DC]" aria-hidden="true" />
                    English · Tagalog
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#6D52DC]" aria-hidden="true" />
                    Evenings
                  </span>
                </div>

                <div className="pt-1 flex items-center justify-center gap-5" aria-hidden="true">
                  <div className="w-12 h-12 rounded-full bg-[#F5F7FC] flex items-center justify-center text-[#161F3B]/50">
                    <X className="w-5 h-5" />
                  </div>
                  <div className="w-14 h-14 rounded-full bg-[#6D52DC] flex items-center justify-center text-white shadow-lg shadow-[#6D52DC]/35">
                    <Heart className="w-6 h-6 fill-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
