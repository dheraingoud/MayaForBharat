'use client';

/*
 * SilentBuildStrip — slim status strip that REPLACES the full-screen
 * <GenerateJobCard> chat-column surface during the silent autonomous build
 * (Bug 2026-07-11: user must never see "Building your app" while on the site).
 *
 * Mounts at the TOP of the chat column (BuilderPage render switch @ ~L2393).
 * The chat Messages + the preview column ALWAYS render below/alongside it —
 * no full-screen blocking card. Verify/health stays silent (S1-S5 contract).
 *
 * Renders from workbenchStore.silentPhase/silentCycle atoms directly:
 *   building        → "Building · cycle N/15"      (+ Cancel)
 *   verifying       → "Verifying preview · cycle N/15"
 *   vision-judging  → "Vision-judging · cycle N/15"
 *   exhausted       → "Exhausted after 15 cycles"   (+ Retry / Continue)
 *
 * The parent mounts this when `silentBuildActive || silentPhase === 'exhausted'`
 * so the give-up surface (Retry/Continue) stays visible after the exhaustion
 * setters clear `silentBuildActive` (the prior full-card's exhausted variant was
 * dead UI — every exhausted setter disarmed the card same tick → unmounted).
 *
 * Stateless aside from the atom reads + callbacks; all subscription state lives
 * upstream in BuilderPage.
 */

import { useStore } from '@nanostores/react';
import { Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { workbenchStore } from '@/lib/workbench/stores/workbench';

export interface SilentBuildStripProps {
  language: 'en' | 'hi' | string;
  onCancel?: () => void | Promise<void>;
  onRetry?: () => void | Promise<void>;
  onContinue?: () => void | Promise<void>;
  /** Max cycles — mirrors SILENT_MAX_CYCLES (BuilderPage.tsx:206) so the label
   * stays in sync without a cross-file constant import. */
  maxCycles?: number;
}

export function SilentBuildStrip({
  language,
  onCancel,
  onRetry,
  onContinue,
  maxCycles = 15,
}: SilentBuildStripProps) {
  const silentPhase = useStore(workbenchStore.silentPhase);
  const silentCycle = useStore(workbenchStore.silentCycle);
  const isHindi = language === 'hi';

  // ── Exhausted variant: the ONE labeled give-up surface (Q3/Q4). Retry re-arms
  //    the loop from cycle 1; Continue hands control back to the user. Replaces
  //    the dead GenerateJobCard exhausted variant.
  if (silentPhase === 'exhausted') {
    return (
      <div
        role="status"
        aria-label={isHindi ? 'बिल्ड 15 चक्रों में समाप्त' : 'Build exhausted after 15 cycles'}
        data-silent-phase="exhausted"
        className="flex flex-col gap-3 px-3 pt-3 pb-4 border-b border-white/[0.06] bg-[#111110]"
      >
        <div className="flex flex-col gap-2 rounded-xl ring-1 ring-[#E8601A]/25 bg-[#1A1917] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#E8601A]/12 text-[#E8601A] text-xs font-bold uppercase">!</span>
            <span className="text-[13px] font-medium text-[#F5F4F0]">
              {isHindi ? `स्वायत्त लूप ${maxCycles} चक्रों में समाप्त` : `Autonomous loop exhausted after ${maxCycles} cycles`}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#9E9890]">
            {isHindi
              ? 'परिपूर्ण प्रीव्यू नहीं मिल पाया। रिट्राय करके फिर से चलाएं, या जारी रखकर मैन्युअल भेजने के लिए कंपोज़र अनलॉक करें।'
              : 'Could not reach a perfect preview. Retry to run the loop again, or continue to take over manually.'}
          </p>
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={() => { void onRetry?.(); }}
              className="inline-flex items-center gap-1.5 text-[12px] bg-[#E8601A] hover:bg-[#FF6E1F] px-3 py-1.5 rounded-lg font-medium text-[#111110] active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {isHindi ? 'रिट्राय' : 'Retry'}
            </button>
            <button
              onClick={() => { void onContinue?.(); }}
              className="inline-flex items-center gap-1.5 text-[12px] bg-[#1A1917] hover:bg-[#222120] ring-1 ring-white/[0.06] px-3 py-1.5 rounded-lg font-medium text-[#F5F4F0] active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              {isHindi ? 'जारी रखें' : 'Continue'} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── In-flight slim pill: cycle + phase + Cancel. NO h-full, NO centered
  //    loader — just a top strip so chat+preview render beneath it.
  const phaseLabel =
    silentPhase === 'vision-judging'
      ? isHindi ? 'विज़न-जाँच' : 'Vision-judging'
      : silentPhase === 'verifying'
      ? isHindi ? 'प्रीव्यू जाँच' : 'Verifying preview'
      : isHindi ? 'बिल्ड हो रहा है' : 'Building';
  const cycleLabel = `${silentCycle}/${maxCycles}`;

  return (
    <div
      role="status"
      aria-label={phaseLabel}
      data-silent-phase={silentPhase}
      className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2.5 border-b border-white/[0.06] bg-[#111110]"
    >
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1A1917] ring-1 ring-white/[0.06]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-pulse" />
        <Loader2 className="w-3.5 h-3.5 text-[#E8601A] animate-spin" />
        <span className="text-[11px] font-medium text-[#F5F4F0]">{phaseLabel}</span>
        <span className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#E8601A]/12 text-[#E8601A] ring-1 ring-[#E8601A]/20">
          {isHindi ? 'चक्र' : 'cycle'} {cycleLabel}
        </span>
      </div>
      {onCancel ? (
        <button
          onClick={() => { void onCancel?.(); }}
          className="text-[11px] text-[#9E9890] hover:text-[#F5F4F0] underline underline-offset-2 transition-colors"
        >
          {isHindi ? 'रद्द करें' : 'Cancel'}
        </button>
      ) : null}
    </div>
  );
}

export default SilentBuildStrip;
