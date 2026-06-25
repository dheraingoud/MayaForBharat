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
import { Loader2, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import type {
  GenerateJobStatus,
  GenerateJobView,
} from '@/lib/workbench/hooks/useGenerateJob';

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
      return 'Queued — waiting for worker';
    case 'building':
      return 'Building your app';
    case 'live':
      return 'Ready — opening workspace';
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

  // `live` is always hidden — parent switches view.
  if (job.status === 'live') return null;

  const inFlight = job.status === 'building' || job.status === 'pending';

  return (
    <div
      role="status"
      aria-label={StatusLabel(job.status)}
      data-app-id={appId}
      data-job-status={job.status}
      className="flex flex-col items-center justify-center h-full gap-4 bg-[#111110] text-white px-6 text-center"
    >
          {inFlight ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-[#E8601A]" aria-hidden="true" />
              <h2 className="text-lg font-medium">{StatusLabel(job.status)}</h2>
              {note ? (
                <p className="text-xs text-white/55">
                  {String(note)}
               </p>
              ) : null}
              <p className="text-xs text-white/30">
                elapsed &middot; {fmtElapsed(elapsed)}
             </p>
              {job.transientJob && job.transientJob.progressNote ? (
                <p className="text-[10px] text-white/25 max-w-md">
                  subscriber {String(job.transientJob._id ?? '').slice(-6) || ''}: {job.transientJob.progressNote}
               </p>
              ) : null}
              <button
                onClick={() => {
                  void onCancel();
                }}
                className="mt-2 text-xs text-white/55 hover:text-white underline"
              >
                Cancel build
             </button>
            </>
          ) : null}

          {job.status === 'error' ? (
            <>
              <AlertTriangle className="w-9 h-9 text-red-500" aria-hidden="true" />
              <h2 className="text-lg font-medium">{StatusLabel(job.status)}</h2>
              {note ? (
                <p className="text-xs text-white/55">
                  {String(note)}
               </p>
              ) : null}
              {job.error ? (
                <p className="text-xs text-white/40 max-w-md break-words">
                  {job.error}
               </p>
              ) : null}
              <button
                onClick={() => {
                  void onRetry();
                }}
                className="mt-2 text-sm bg-[#E8601A] hover:bg-[#FF6E1F] px-4 py-2 rounded font-medium"
              >
                Retry build
             </button>
            </>
          ) : null}

          {job.status === 'cancelled' ? (
            <>
              <X className="w-9 h-9 text-white/45" aria-hidden="true" />
              <h2 className="text-lg font-medium">{StatusLabel(job.status)}</h2>
              {note ? (
                <p className="text-xs text-white/40">
                  {String(note)}
               </p>
              ) : null}
              <button
                onClick={() => {
                  void onBuild();
                }}
                className="mt-2 text-sm bg-[#E8601A] hover:bg-[#FF6E1F] px-4 py-2 rounded font-medium"
              >
                Build now
             </button>
            </>
          ) : null}


      <p className="text-[10px] text-white/20 mt-4">
        job {job._id?.slice(-8) ?? '-'} &middot; app {appId.slice(0, 8)}
    </p>
   </div>
  );
}

/** Tiny success banner used right before the workbench unmounts this card. */
export function GeneratingSuccessBanner({ fileCount }: { fileCount: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-emerald-300 px-4 py-2 bg-emerald-900/20 border-b border-emerald-700/30">
      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
      <span>
        Build complete &middot; {fileCount} file{fileCount === 1 ? '' : 's'} loaded
    </span>
   </div>
  );
}
