import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { getFirebaseProjectInfo } from '../lib/firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isQuota: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '', isQuota: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'An unexpected application error occurred.';
    const isQuota = raw.toLowerCase().includes('quota exceeded');
    let friendly = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) {
        friendly = `${parsed.error} (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'database'})`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, errorMessage: friendly, isQuota };
  }

  componentDidCatch(error: Error) {
    console.error('SkillSwipe ErrorBoundary caught:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { projectId, databaseId } = getFirebaseProjectInfo();

    return (
      <div className="min-h-screen bg-[#F1F3FA] flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-sm border border-[#1C2748]/8">
          <div className="w-12 h-12 rounded-2xl bg-[#F47B89]/15 text-[#C94858] flex items-center justify-center mb-5">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#1C2748] tracking-tight">
            {this.state.isQuota ? 'Daily database quota reached' : 'Something went wrong'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#1C2748]/75">
            {this.state.isQuota
              ? 'This Firebase project has reached its daily free-tier Firestore read/write limit. Quota resets automatically the next day.'
              : 'SkillSwipe encountered an error while syncing with your account. Reloading usually resolves temporary connection issues.'}
          </p>

          <div className="mt-4 rounded-2xl bg-[#F1F3FA] p-4 text-xs font-mono text-[#1C2748]/80 break-words">
            {this.state.errorMessage}
          </div>

          {this.state.isQuota && projectId && databaseId && (
            <p className="mt-4 text-xs text-[#1C2748]/70">
              Manage database usage in Firebase Console:{' '}
              <a
                href={`https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data?openUpgradeDialog=true`}
                target="_blank"
                rel="noreferrer"
                className="text-[#7155D9] font-medium underline"
              >
                Open Firestore Console
              </a>
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#1C2748] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#27355F] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reload SkillSwipe
            </button>
          </div>
        </div>
      </div>
    );
  }
}
