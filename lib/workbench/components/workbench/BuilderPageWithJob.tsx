'use client';

/*
 * BuilderPageWithJob — wrapper that mounts the existing BuilderPage only after
 * a generateJobs row reaches `live`. While the row is in `pending` / `building`
 * / `error` / `cancelled`, this renders <GenerateJobCard> instead — preserving
 * the user's tab through browser-closes because the worker lives on Convex.
 *
 * Wiring:
 *   /workbench/[id] page → BuilderPageWithJob(appId, prompt, model, provider)
 *     on first render if no `live` row exists for appId:
 *       useEffect → useCreateGenerateJob() → submit
 *     on first `live` transition:
 *       useEffect → write files into the already-booted WebContainer singleton,
 *                   then re-render <BuilderPage appId={appId}/>.
 */

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { generateId } from 'ai';
import { toast } from 'react-toastify';

const BUILD_CANCEL_KEY = 'Escape';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { description as chatDescriptionAtom } from '@/lib/workbench/persistence';
import { useGenerateJob } from '@/lib/workbench/hooks/useGenerateJob';
import { useCreateGenerateJob } from '@/lib/workbench/hooks/useCreateGenerateJob';
import { useCancelGenerateJob } from '@/lib/workbench/hooks/useCancelGenerateJob';
import {
  GenerateJobCard,
} from '@/lib/workbench/components/workbench/GenerateJobCard';
import { webcontainer } from '@/lib/workbench/webcontainer';

// Importing builder page via dynamic is what /workbench/[id]/page.tsx does today;
// we reuse that pattern so SSR/WebContainer boot behavior matches.
const BuilderPage = dynamic(
  () => import('@/lib/workbench/components/workbench/BuilderPage').then((m) => ({ default: m.BuilderPage })),
  { ssr: false },
);

export interface BuilderPageWithJobProps {
  appId: string;
  prompt?: string | null;
  model?: string | null;
  provider?: string | null;
}

const WORK_DIR = '/home/project';

async function writeFilesToWebContainer(
  files: Array<{ path: string; content: string }>,
): Promise<{ written: number; failed: string[] }> {
  const container = await webcontainer;
  const failed: string[] = [];
  let written = 0;

  // Sort so directories come first (mkdir all parent dirs in one pass before files).
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    if (!file.path) continue;
    // Strip leading slashes; everything lives under WORK_DIR.
    const rel = file.path.replace(/^\/+/, '');
    const abs = `${WORK_DIR}/${rel}`;
    const parent = abs.split('/').slice(0, -1).join('/') || WORK_DIR;
    try {
      // mkdir -p the parent (mkdir is a no-op if it already exists).
      await container.fs.mkdir(parent, { recursive: true }).catch(() => {});
      await container.fs.writeFile(abs, file.content);
      written++;
    } catch (e) {
      console.error('[BuilderPageWithJob] writeFile failed', abs, e);
      failed.push(file.path);
    }
  }

  return { written, failed };
}

export function BuilderPageWithJob({
  appId,
  prompt,
  model,
  provider,
}: BuilderPageWithJobProps) {
  const job = useGenerateJob(appId);
  const createJob = useCreateGenerateJob();
  const cancelJob = useCancelGenerateJob();
  const submittedRef = useRef(false);
  const mountedFileSetRef = useRef<string | null>(null);

  // ── 1. On first mount, if the user came in with ?prompt=... AND no live row
  //      exists yet, kick off a brand-new generation job.
  useEffect(() => {
    if (submittedRef.current) return;
    if (!appId) return;
    if (!prompt || !model || !provider) return;
    if (job.status === 'live') return; // already built earlier, no need to submit again
    if (!job.isReady) return; // first paint — wait for subscription

    // Don't auto-resubmit if there's any recent row (live/error/cancelled).
    // The user can retry from the card.
    if (job._id) return;

    submittedRef.current = true;
    createJob({ appId, prompt, model, provider })
      .then(() => {
        toast.info('Generation started', { autoClose: 2500 });
      })
      .catch((e: Error) => {
        submittedRef.current = false; // allow retry
        toast.error(`Could not start build: ${e.message}`);
      });
  }, [appId, prompt, model, provider, job.isReady, job._id, job.status, createJob]);

  // ── 1.5 Esc key on the document cancels an in-flight build (v0-ish).
  //        Cleaned up on unmount.
  useEffect(() => {
    if (job.status !== 'building' && job.status !== 'pending') return;
    if (!job._id) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== BUILD_CANCEL_KEY) return;
      // Don't intercept if the user is editing a text input.
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName ?? '').toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (t?.isContentEditable ?? false)
      ) {
        return;
      }
      e.preventDefault();
      cancelJob(job._id as string)
        .then((r) => {
          if ('ok' in r && r.ok) {
            toast('Build cancelled', { type: 'info', autoClose: 2000 });
          }
        })
        .catch(() => {
          // Already-cancelled or stale; silent.
        });
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [job.status, job._id, cancelJob]);

  // ── 2. When the row reaches `live`, write the files into the WebContainer
  //      exactly once. After that, hand off to <BuilderPage>.
  useEffect(() => {
    if (job.status !== 'live') return;

    // Empty live (model produced no file actions) is NOT an error — the model
    // either finished an empty response (probably network glitch) or
    // returned only text. Just nudge the user with a toast; do NOT set the
    // alert state, because the chat alert renders as a Terminal Error modal
    // regardless of type for non-error sources by mistake. Keep `alert`
    // cleared so the workbench is fully usable.
    if (!job.files || job.files.length === 0) {
      try {
        // Best-effort: clear any modal that may have been set elsewhere so
        // the workbench doesn't get stuck showing a Terminal Error card.
        workbenchStore.actionAlert.set(undefined);
      } catch {
        /* ignore */
      }
      toast.warn('Model returned no files. Try a more specific prompt or retry.', {
        toastId: 'no-files',
      });
      return;
    }
    const tag = `${job._id ?? ''}:${job.files.length}`;
    if (mountedFileSetRef.current === tag) return;
    mountedFileSetRef.current = tag;

    writeFilesToWebContainer(job.files).then(({ written, failed }) => {
      // Populate the workbenchFile store so Builders/Preview file tree mirrors the WC.
      const map: Record<string, any> = {};
      for (const f of job.files ?? []) {
        map[f.path] = {
          type: 'file',
          content: f.content,
          isBinary: false,
        };
      }
      workbenchStore.files.set(map as any);

      // Update chat description with the app name if we can find one (best-effort).
      try {
        if (!chatDescriptionAtom.get()) {
          chatDescriptionAtom.set(`Generated app ${(appId ?? '').slice(0, 6)}`);
        }
      } catch {}

      if (failed.length > 0) {
        toast.warn(`Wrote ${written}/${job.files!.length} files (${failed.length} failed)`);
      } else {
        toast.success(`Build ready · ${written} files`, { autoClose: 2500 });
      }
    });
  }, [job.status, job._id, job.files, appId]);

  // ── Render: card first, then defer to the existing BuilderPage once live.
  if (job.status !== 'live') {
    return (
      <GenerateJobCard
        appId={appId}
        job={job}
        onCancel={async () => {
          if (!job._id) return;
          const r = await cancelJob(job._id as string);
          if ('ok' in r && r.ok) toast('Build cancelled', { type: 'info' });
        }}
        onRetry={async () => {
          if (!prompt || !model || !provider) {
            toast.error('Missing original prompt — open the dashboard to retry.');
            return;
          }
          submittedRef.current = false;
          mountedFileSetRef.current = null;
          try {
            await createJob({ appId, prompt, model, provider });
            toast.info('Retrying build');
          } catch (e: any) {
            toast.error(`Retry failed: ${e.message}`);
          }
        }}
        onBuild={async () => {
          if (!prompt || !model || !provider) {
            toast.error('Missing original prompt.');
            return;
          }
          submittedRef.current = false;
          mountedFileSetRef.current = null;
          try {
            await createJob({ appId, prompt, model, provider });
          } catch (e: any) {
            toast.error(`Build failed: ${e.message}`);
          }
        }}
      />
    );
  }

  return <BuilderPage appId={appId} />;
}
