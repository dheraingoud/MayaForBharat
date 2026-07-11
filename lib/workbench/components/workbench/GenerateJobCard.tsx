'use client';

/*
 * GenerateJobCard — v0-style status card for the workbench.
 *
 * Rendered by `BuilderPageWithJob` (and similar) when an `appId` is present
 * but the generation job is still in-flight (`pending`/`building`), failed,
 * or cancelled. On `live`, the parent unmounts this card and renders the
 * normal workbench (the files are already mounted into the WebContainer).
 *
 * Stateless aside from elapsed counter; all subscription state lives upstream
 * in `useGenerateJob`.
 */

import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Loader2, AlertTriangle, X, CheckCircle2, Wrench, RefreshCw, ArrowRight } from 'lucide-react';
import type {
  GenerateJobStatus,
  GenerateJobView,
} from '@/lib/workbench/hooks/useGenerateJob';
import { workbenchStore } from '@/lib/workbench/stores/workbench';

export interface GenerateJobCardProps {
  appId: string;
  job: GenerateJobView;
  onCancel: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onBuild: () => void | Promise<void>;
}

function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  return elapsed;
}

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, '0')}s`;
}

function StatusLabel(s: GenerateJobStatus): string {
  switch (s) {
    case 'pending':
      return 'Queued. waiting for worker';
    case 'building':
      return 'Building your app';
    case 'live':
      return 'Ready. opening workspace';
    case 'error':
      return 'Build failed';
    case 'cancelled':
      return 'Build cancelled';
    default:
      return 'Working';
  }
}

export function GenerateJobCard({
  appId,
  job,
  onCancel,
  onRetry,
  onBuild,
}: GenerateJobCardProps) {
  const elapsed = useElapsedSeconds(job.status === 'pending' || job.status === 'building');
  const note = job.progressNote ?? (
    job.status === 'building'
      ? 'connecting to model…'
      : job.status === 'pending'
      ? 'slot acquired'
      : null
  );

  // S4: silent autonomous build — the card is the lone live surface. While the
  // in-browser silent loop is armed, the vision-judge/auto-fix rounds drive
  // silentPhase (building→verifying→vision-judging→exhausted); silentCycle is
  // 1..SILENT_MAX_CYCLES. Show that as a sub-status strip so the user sees the
  // loop progressing with zero chat noise. At silentPhase==='exhausted' (15
  // failed rounds, or a fatal stream error), the card flips to the labeled
  // give-up state with Retry/Continue — no user bubble auto-added (Q3).
  const silentPhase = useStore(workbenchStore.silentPhase);
  const silentCycle = useStore(workbenchStore.silentCycle);

  // `live` is always hidden — parent switches view.
  if (job.status === 'live' && silentPhase !== 'exhausted') return null;

  // S4: exhausted variant — the silent loop gave up after 15 rounds (or hit a
  // fatal stream error mid-build). This is the ONE labeled status that
  // replaces chat during give-up (Q3/Q4): no user bubble, no toast — just this
  // card with Retry (re-arm the silent loop from cycle 1) / Continue (hand
  // control back to the user for a manual send). Supersedes every other state.
  if (silentPhase === 'exhausted') {
    return (
      <div
        role="status"
        aria-label="Build exhausted"
        data-silent-phase="exhausted"
        data-app-id={appId}
        className="flex flex-col items-center justify-center h-full gap-4 bg-[#111110] text-[#F5F4F0] px-6 text-center"
      >
        <AlertTriangle className="w-9 h-9 text-[#E8601A]" aria-hidden="true" />
        <h2 className="text-lg font-medium text-[#F5F4F0]">Exhausted after 15 cycles</h2>
        <p className="text-xs text-[#9E9890] max-w-md">
          {note ? `${String(note)} · ` : ''}
          the autonomous loop could not reach a perfect preview. Retry to run it
          again, or continue to take over manually.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => { void onRetry(); }}
            className="inline-flex items-center gap-1.5 text-sm bg-[#E8601A] hover:bg-[#FF6E1F] px-4 py-2 rounded-lg font-medium text-[#111110] active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
          <button
            onClick={() => { void onBuild(); }}
            className="inline-flex items-center gap-1.5 text-sm bg-[#1A1917] hover:bg-[#222120] ring-1 ring-white/[0.06] px-4 py-2 rounded-lg font-medium text-[#F5F4F0] active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            Continue <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-[#3A3835] mt-4 font-mono">
          job {job._id?.slice(-8) ?? '-'} &middot; app {appId.slice(0, 8)}
        </p>
      </div>
    );
  }

  const inFlight = job.status === 'building' || job.status === 'pending';

  return (
    <div
      role="status"
      aria-label={StatusLabel(job.status)}
      data-app-id={appId}
      data-job-status={job.status}
      className="flex flex-col items-center justify-center h-full gap-4 bg-[#111110] text-[#F5F4F0] px-6 text-center"
    >
          {inFlight ? (
            <>
              {/* vercel Tool aesthetic: header row (wrench + title + status pill) */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1A1917] ring-1 ring-white/[0.06]">
                <Wrench size={13} className="text-[#E8601A]" />
                <span className="text-xs font-medium text-[#F5F4F0]">Building on Convex</span>
                <span className="inline-flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E8601A]/12 text-[#E8601A] ring-1 ring-[#E8601A]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-pulse" />
                  {job.status === 'building' ? 'Building' : 'Pending'}
                </span>
              </div>

              <Loader2 className="w-8 h-8 animate-spin text-[#E8601A]" aria-hidden="true" />
              <h2 className="text-lg font-medium text-[#F5F4F0]">{StatusLabel(job.status)}</h2>
              {note ? (
                <p className="text-xs text-[#9E9890]">
                  {String(note)}
               </p>
              ) : null}
              <p className="text-xs text-[#3A3835] font-mono">
                elapsed &middot; {fmtElapsed(elapsed)}
             </p>
              {job.transientJob && job.transientJob.progressNote ? (
                <p className="text-[10px] text-[#3A3835] max-w-md font-mono">
                  subscriber {String(job.transientJob._id ?? '').slice(-6) || ''}: {job.transientJob.progressNote}
               </p>
              ) : null}

              {/* file-write list from job.files (progressive writes shown) */}
              {job.files && job.files.length > 0 ? (
                <div className="w-full max-w-lg mt-2 flex flex-col gap-1.5 text-left">
                  {job.files.map((f, i) => (
                    <div
                      key={`${f.path}-${i}`}
                      className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#1A1917]/50 px-2.5 py-1.5"
                    >
                      <span className="inline-flex items-center justify-center shrink-0 h-5 w-5 rounded-md bg-[#E8601A]/12 text-[#E8601A] text-[9px] font-bold uppercase">
                        {f.path.split('.').pop()?.slice(0, 2) ?? 'f'}
                      </span>
                      <code className="flex-1 min-w-0 truncate font-mono text-xs text-[#D4D0CA]">{f.path}</code>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2D7A4F]" aria-label="written" />
                    </div>
                  ))}
                </div>
              ) : null}

              {/* S4: silent-phase sub-status — the lone live surface shows the
                  vision/auto-fix round progressing with zero chat noise. */}
              {silentPhase === 'verifying' || silentPhase === 'vision-judging' ? (
                <div className="inline-flex items-center gap-2 mt-1 px-3 py-1.5 rounded-full bg-[#1A1917] ring-1 ring-white/[0.06] text-[11px] text-[#9E9890]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-pulse" />
                  {silentPhase === 'vision-judging'
                    ? `Vision-judging · cycle ${silentCycle}/15`
                    : `Verifying preview · cycle ${silentCycle}/15`}
                </div>
              ) : null}

              <button
                onClick={() => {
                  void onCancel();
                }}
                className="mt-2 text-xs text-[#9E9890] hover:text-[#F5F4F0] underline underline-offset-2"
              >
                Cancel build
             </button>
            </>
          ) : null}

          {job.status === 'error' ? (
            <>
              <AlertTriangle className="w-9 h-9 text-[#F87171]" aria-hidden="true" />
              <h2 className="text-lg font-medium text-[#F5F4F0]">{StatusLabel(job.status)}</h2>
              {note ? (
                <p className="text-xs text-[#9E9890]">
                  {String(note)}
               </p>
              ) : null}
              {job.error ? (
                <p className="text-xs text-[#6B6560] max-w-md break-words">
                  {job.error}
               </p>
              ) : null}
              <button
                onClick={() => {
                  void onRetry();
                }}
                className="mt-2 text-sm bg-[#E8601A] hover:bg-[#FF6E1F] px-4 py-2 rounded-lg font-medium text-[#111110] active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
              >
                Retry build
             </button>
            </>
          ) : null}

          {job.status === 'cancelled' ? (
            <>
              <X className="w-9 h-9 text-[#6B6560]" aria-hidden="true" />
              <h2 className="text-lg font-medium text-[#F5F4F0]">{StatusLabel(job.status)}</h2>
              {note ? (
                <p className="text-xs text-[#9E9890]">
                  {String(note)}
               </p>
              ) : null}
              <button
                onClick={() => {
                  void onBuild();
                }}
                className="mt-2 text-sm bg-[#E8601A] hover:bg-[#FF6E1F] px-4 py-2 rounded-lg font-medium text-[#111110] active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
              >
                Build now
             </button>
            </>
          ) : null}


      <p className="text-[10px] text-[#3A3835] mt-4 font-mono">
        job {job._id?.slice(-8) ?? '-'} &middot; app {appId.slice(0, 8)}
    </p>
   </div>
  );
}

/** Tiny success banner used right before the workbench unmounts this card. */
export function GeneratingSuccessBanner({ fileCount }: { fileCount: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#2D7A4F] px-4 py-2 bg-[#2D7A4F]/10 border-b border-[#2D7A4F]/25">
      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
      <span>
        Build complete &middot; {fileCount} file{fileCount === 1 ? '' : 's'} loaded
    </span>
   </div>
  );
}
