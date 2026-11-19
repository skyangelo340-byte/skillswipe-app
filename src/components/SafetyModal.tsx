import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Ban, X, CheckCircle2 } from 'lucide-react';
import { LIMITS, REPORT_REASONS, type ReportReason } from '../types/skillswipe';

interface SafetyModalProps {
  mode: 'block' | 'report';
  targetName: string;
  onClose: () => void;
  onConfirmBlock: () => Promise<void>;
  onConfirmReport: (reason: ReportReason, details: string, alsoBlock: boolean) => Promise<void>;
}

export function SafetyModal({
  mode,
  targetName,
  onClose,
  onConfirmBlock,
  onConfirmReport,
}: SafetyModalProps) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'block') {
        await onConfirmBlock();
        setDoneMessage(
          `${targetName} has been blocked. They will no longer appear in your Discover feed and cannot message or call you.`
        );
      } else {
        await onConfirmReport(reason, details, alsoBlock);
        setDoneMessage(
          alsoBlock
            ? `Your safety report has been recorded and ${targetName} has been blocked.`
            : 'Your safety report has been recorded for moderation review.'
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to complete this safety action right now.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="safety-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#060812]/70 backdrop-blur-md p-0 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="w-full sm:max-w-md rounded-t-[32px] sm:rounded-[32px] bg-white dark:bg-[#13192B] border-t sm:border border-[#161F3B]/[0.06] dark:border-white/[0.1] p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Mobile sheet drag affordance */}
        <div
          aria-hidden="true"
          className="sm:hidden w-10 h-1.5 rounded-full bg-[#161F3B]/15 dark:bg-white/20 mx-auto mb-4"
        />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                mode === 'block'
                  ? 'bg-[#F26E7E]/16 dark:bg-[#EF475A]/18 text-[#B53D4C] dark:text-[#FF8594]'
                  : 'bg-[#6D52DC]/12 dark:bg-[#7C5CFF]/20 text-[#6D52DC] dark:text-[#B4A3FF]'
              }`}
            >
              {mode === 'block' ? (
                <Ban className="w-5 h-5" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2
                id="safety-modal-title"
                className="font-display text-lg font-extrabold text-[#161F3B] dark:text-white"
              >
                {mode === 'block' ? `Block ${targetName}?` : `Report ${targetName}`}
              </h2>
              <p className="text-xs text-[#161F3B]/55 dark:text-white/50 mt-0.5">
                {mode === 'block'
                  ? 'Immediate boundary enforcement'
                  : 'Stored privately for safety review'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close safety dialog"
            className="min-w-[40px] min-h-[40px] -mr-1 -mt-1 rounded-full flex items-center justify-center text-[#161F3B]/50 dark:text-white/50 hover:text-[#161F3B] dark:hover:text-white hover:bg-[#F5F7FC] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {doneMessage ? (
          <div className="mt-6">
            <div className="rounded-2xl bg-[#9CE7D3]/30 dark:bg-[#9CE7D3]/15 border border-transparent dark:border-[#9CE7D3]/25 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#0E4A3C] dark:text-[#8DF0D4] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-[#161F3B] dark:text-white/90 leading-relaxed">
                {doneMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full min-h-[48px] rounded-full bg-[#161F3B] dark:bg-gradient-to-r dark:from-[#7C5CFF] dark:to-[#5E3FE8] text-white text-sm font-semibold hover:bg-[#233159] dark:hover:brightness-110 transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : mode === 'block' ? (
          <div className="mt-5">
            <p className="text-sm leading-relaxed text-[#161F3B]/75 dark:text-white/70">
              Blocking{' '}
              <span className="font-semibold text-[#161F3B] dark:text-white">{targetName}</span>{' '}
              immediately revokes any active match chat or video call access and hides both of you from each other&apos;s Discover feed.
            </p>
            {error && (
              <p className="mt-3 text-xs font-medium text-[#B53D4C] dark:text-[#FF8594]">{error}</p>
            )}
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 min-h-[46px] rounded-full bg-[#F5F7FC] dark:bg-white/[0.08] text-[#161F3B] dark:text-white text-sm font-semibold hover:bg-[#E8ECF7] dark:hover:bg-white/[0.14] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 min-h-[46px] rounded-full bg-[#EF475A] text-white text-sm font-semibold hover:bg-[#DC384B] transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Blocking...' : 'Confirm block'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-2">
                Select a reason
              </legend>
              {REPORT_REASONS.map((item) => (
                <label
                  key={item.value}
                  className={`flex items-start gap-3 rounded-2xl p-3.5 transition-colors cursor-pointer ${
                    reason === item.value
                      ? 'bg-[#6D52DC]/10 dark:bg-[#7C5CFF]/20 ring-1 ring-[#6D52DC] dark:ring-[#7C5CFF]'
                      : 'bg-[#F5F7FC] dark:bg-white/[0.06] hover:bg-[#ECEFF8] dark:hover:bg-white/[0.1]'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={item.value}
                    checked={reason === item.value}
                    onChange={() => setReason(item.value)}
                    className="mt-1 accent-[#7C5CFF]"
                  />
                  <div>
                    <div className="text-sm font-semibold text-[#161F3B] dark:text-white">
                      {item.label}
                    </div>
                    <div className="text-xs text-[#161F3B]/60 dark:text-white/55 mt-0.5">
                      {item.helper}
                    </div>
                  </div>
                </label>
              ))}
            </fieldset>

            <div>
              <label
                htmlFor="report-details"
                className="block text-xs font-semibold text-[#161F3B]/65 dark:text-white/60 mb-1.5"
              >
                Additional context (optional)
              </label>
              <textarea
                id="report-details"
                rows={3}
                maxLength={LIMITS.REPORT_DETAILS_MAX}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Share what happened so moderators can review accurately..."
                className="w-full rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] border border-transparent dark:border-white/[0.06] px-4 py-3 text-sm text-[#161F3B] dark:text-white placeholder:text-[#161F3B]/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50 focus:bg-white dark:focus:bg-[#1A2238] transition-colors"
              />
              <div className="text-right text-[11px] text-[#161F3B]/45 dark:text-white/40 font-mono-tabular mt-1">
                {details.length}/{LIMITS.REPORT_DETAILS_MAX}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F5F7FC] dark:bg-white/[0.06] px-4 py-3">
              <span className="text-sm font-medium text-[#161F3B] dark:text-white">
                Also block {targetName} immediately
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={alsoBlock}
                aria-label={`Also block ${targetName} immediately`}
                onClick={() => setAlsoBlock((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  alsoBlock ? 'bg-[#7C5CFF]' : 'bg-[#161F3B]/15 dark:bg-white/15'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    alsoBlock ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {error && (
              <p className="text-xs font-medium text-[#B53D4C] dark:text-[#FF8594]">{error}</p>
            )}

            <div className="pt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 min-h-[46px] rounded-full bg-[#F5F7FC] dark:bg-white/[0.08] text-[#161F3B] dark:text-white text-sm font-semibold hover:bg-[#E8ECF7] dark:hover:bg-white/[0.14] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 min-h-[46px] rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#5E3FE8] text-white text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
