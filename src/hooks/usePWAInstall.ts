import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level shared store so beforeinstallprompt is preserved across view transitions
let sharedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let sharedIsInstalled = false;
let initialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isClassicIOS = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadOS;
}

function initGlobalPWAListeners() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  sharedIsInstalled = detectStandalone();

  const handleBeforeInstallPrompt = (e: Event) => {
    e.preventDefault();
    sharedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  };

  const handleAppInstalled = () => {
    sharedIsInstalled = true;
    sharedDeferredPrompt = null;
    notifyListeners();
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  const handleDisplayModeChange = (e: MediaQueryListEvent) => {
    if (e.matches) {
      sharedIsInstalled = true;
      sharedDeferredPrompt = null;
      notifyListeners();
    }
  };
  mediaQuery.addEventListener?.('change', handleDisplayModeChange);
}

export function usePWAInstall() {
  const [, setTick] = useState(0);
  const [isIOS] = useState<boolean>(() => detectIOS());

  useEffect(() => {
    initGlobalPWAListeners();
    const update = () => setTick((t) => t + 1);
    listeners.add(update);
    // Sync immediately in case standalone status changed
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!sharedDeferredPrompt) return false;
    await sharedDeferredPrompt.prompt();
    const { outcome } = await sharedDeferredPrompt.userChoice;
    if (outcome === 'accepted') {
      sharedIsInstalled = true;
      sharedDeferredPrompt = null;
      notifyListeners();
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(sharedDeferredPrompt),
    isInstalled: sharedIsInstalled,
    isIOS,
    install,
  };
}
