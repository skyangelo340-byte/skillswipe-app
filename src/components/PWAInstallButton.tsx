import { useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'sidebar' | 'card';
}

export function PWAInstallButton({ variant = 'compact' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Never show when already running in standalone installed mode
  if (isInstalled) {
    return null;
  }

  // Only show when Chromium install prompt is available or on iOS Safari
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handlePress = () => {
    if (isInstallable) {
      void install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const iosModal = showIOSGuide && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#060912]/70 backdrop-blur-md p-4"
      onClick={() => setShowIOSGuide(false)}
    >
      <div
        className="w-full max-w-sm rounded-[28px] bg-white dark:bg-[#141A2E] border border-[#161F3B]/10 dark:border-white/10 p-6 shadow-2xl text-[#161F3B] dark:text-white space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7C5CFF] to-[#3EC6A8] text-white flex items-center justify-center shadow-md shadow-[#7C5CFF]/25 shrink-0">
              <Smartphone className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 id="ios-install-title" className="font-display text-base font-extrabold">
                Install SkillSwipe
              </h3>
              <p className="text-xs text-[#161F3B]/55 dark:text-white/55">
                Full-screen app on iPhone & iPad
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            aria-label="Close install instructions"
            className="w-8 h-8 rounded-full bg-[#F4F6FC] dark:bg-white/[0.08] flex items-center justify-center text-[#161F3B]/65 dark:text-white/70 hover:text-[#161F3B] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <ol className="space-y-3 text-xs text-[#161F3B]/80 dark:text-white/80">
          <li className="flex items-start gap-3 rounded-2xl bg-[#F4F6FC] dark:bg-white/[0.05] p-3">
            <span className="w-6 h-6 rounded-full bg-[#7C5CFF]/15 text-[#7C5CFF] dark:bg-[#8DF0D4]/15 dark:text-[#8DF0D4] font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <span className="leading-relaxed">
              Tap the <strong className="inline-flex items-center gap-1 text-[#161F3B] dark:text-white"><Share className="w-3.5 h-3.5 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" /> Share</strong> button in Safari&apos;s bottom toolbar.
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-2xl bg-[#F4F6FC] dark:bg-white/[0.05] p-3">
            <span className="w-6 h-6 rounded-full bg-[#7C5CFF]/15 text-[#7C5CFF] dark:bg-[#8DF0D4]/15 dark:text-[#8DF0D4] font-bold flex items-center justify-center shrink-0">
              2
            </span>
            <span className="leading-relaxed">
              Scroll down and tap <strong className="inline-flex items-center gap-1 text-[#161F3B] dark:text-white"><PlusSquare className="w-3.5 h-3.5 text-[#7C5CFF] dark:text-[#8DF0D4]" aria-hidden="true" /> Add to Home Screen</strong>, then tap <strong>Add</strong>.
            </span>
          </li>
        </ol>

        <button
          type="button"
          onClick={() => setShowIOSGuide(false)}
          className="w-full h-10 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold hover:brightness-110 transition-all cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );

  if (variant === 'card') {
    return (
      <>
        <section className="rounded-[28px] glass-surface p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C5CFF] via-[#5D3FE8] to-[#3EC6A8] text-white flex items-center justify-center shadow-md shadow-[#7C5CFF]/25 shrink-0">
              <Smartphone className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-extrabold text-[#161F3B] dark:text-white">
                Install SkillSwipe App
              </div>
              <p className="text-xs text-[#161F3B]/55 dark:text-white/55 mt-0.5 leading-snug">
                {isIOS
                  ? 'Add to your iPhone Home Screen for full-screen access.'
                  : 'Install directly on your device — free, fast & full-screen.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePress}
            className="h-9 px-4 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] shadow-sm shadow-[#7C5CFF]/25 transition-all shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isIOS ? 'How to install' : 'Install'}</span>
          </button>
        </section>
        {iosModal}
      </>
    );
  }

  if (variant === 'sidebar') {
    return (
      <>
        <button
          type="button"
          onClick={handlePress}
          className="w-full h-10 px-3.5 rounded-xl bg-gradient-to-r from-[#7C5CFF]/15 to-[#3EC6A8]/15 hover:from-[#7C5CFF]/25 hover:to-[#3EC6A8]/25 border border-[#7C5CFF]/25 dark:border-[#8DF0D4]/25 text-[#5D3FE8] dark:text-[#8DF0D4] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isIOS ? 'Install on iOS' : 'Install SkillSwipe App'}</span>
        </button>
        {iosModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handlePress}
        className="h-8 px-3 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-[11px] font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-[#7C5CFF]/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
      >
        <Download className="w-3 h-3" aria-hidden="true" />
        <span>Install</span>
      </button>
      {iosModal}
    </>
  );
}
