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
import { devServerBooting } from '@/lib/workbench/stores/streaming';
import { useDeployedPreview } from '@/lib/workbench/hooks/useDeployedPreview';

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

  // Deployed-preview-on-reopen (Bug 2026-07-08): read the apps row's deployed
  // state reactively; stored in a ref so Effect#2 (which closes over mount-time
  // values) reads the latest. When deployed + vercelUrl, we skip the local
  // `npm run dev` boot and let Preview.tsx render the deployed URL directly.
  const deployed = useDeployedPreview(appId);
  const deployedRef = useRef(deployed);
  deployedRef.current = deployed;

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

    // Empty live (model produced no file actions) from the DETACHED Convex
    // job. The in-browser chat path (BuilderPage's action-runner) runs the
    // SAME prompt in parallel + writes files into the live WebContainer. If
    // that path already populated workbenchStore.files — which it does the
    // moment the model emits any boltAction — the detached `live`+0 row is a
    // false positive (a stale/old Convex deployment that markLives w/ [] on a
    // 503/reasoning-only stream, or a parallel race it lost) and MUST NOT
    // toast "no files" while the user is staring at a working vite preview.
    // Only surface the toast when the in-browser store is also empty — the
    // genuine no-files-anywhere case.
    if (!job.files || job.files.length === 0) {
      const inBrowserFiles = workbenchStore.files.get();
      const inBrowserCount = inBrowserFiles ? Object.keys(inBrowserFiles).length : 0;
      if (inBrowserCount === 0) {
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
      }
      return;
    }
    // Survival-vs-visible gate. The in-browser stream (BuilderPage's
    // action-runner) and this detached Convex job both generate the same app
    // concurrently. If the in-browser path already populated
    // workbenchStore.files, this job's file array is a duplicate source from a
    // parallel LLM call — SKIP the write so we never clobber the live
    // WebContainer mid-build. The detached write only matters on the
    // come-back path: browser was closed mid-build → on reopen files are
    // empty (nanostore resets) → detached `live` hydrates here.
    const existingFiles = workbenchStore.files.get();
    if (Object.keys(existingFiles).length > 0) {
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

      // Boot the dev server in the WebContainer we just wrote into. BuilderPage's
      // AutoStart effect (L928) does NOT cover this hydration path: it requires
      // `hasMessages` (chat history) AND its dep array omits workbenchStore.files,
      // so a freshly hydrated detached job (no chat, files arrive post-mount)
      // falls through both guards → preview stays "No preview detected" forever
      // even though 8 files wrote OK. We reached here only because the in-browser
      // store was empty (gate at L189), so the in-browser action-runner didn't
      // emit shell/start actions either — safe to boot here.
      const previews = workbenchStore.previews.get();
      // Deployed app reopen: skip the local dev boot — Preview.tsx shows the
      // deployed Vercel URL directly (Bug 2026-07-08). Files were still written
      // above so a later local edit can boot without re-fetching.
      const skipBoot = deployedRef.current.isDeployed && !!deployedRef.current.vercelUrl;
      if (previews.length === 0 && !skipBoot) {
        (async () => {
          // Cross-component double-boot gate (Bug 2026-07-08): on a come-back
          // reopen BuilderPage's AutoStart AND this Effect#2 can both fire
          // against the same WebContainer → two concurrent installs + two vite
          // servers fighting for the same port. The first path to reach the
          // spawn sets the flag; the second bails.
          if (devServerBooting.get()) {
            console.info('[BuilderPageWithJob] dev server already booting — skipping');
            return;
          }
          devServerBooting.set(true);
          try {
            const wc = await webcontainer;
            const { detectProjectCommands } = await import('@/lib/workbench/utils/projectCommands');
            const fileList = (job.files ?? []).map((f) => ({ path: f.path, content: f.content }));
            const commands = await detectProjectCommands(fileList);
            const installCmd = commands.setupCommand || 'npm install --no-audit --no-fund';
            const startCmd = commands.startCommand || 'npm run dev';
            const installProc = await wc.spawn('sh', ['-c', installCmd]);
            const installExit = await installProc.exit;
            if (installExit !== 0) {
              console.warn('[BuilderPageWithJob] install exit', installExit, '— trying dev anyway');
            }
            await wc.spawn('sh', ['-c', startCmd]); // don't await — runs indefinitely
          } catch (e) {
            console.error('[BuilderPageWithJob] dev-server boot failed', e);
            // Release the boot flag on failure — previews.ts only clears it on
            // `server-ready`/port-open success, so we must self-clear here or a
            // competing path / retry would be blocked forever.
            devServerBooting.set(false);
          }
        })();
      }
    });
  }, [job.status, job._id, job.files, appId]);

  // ── Render:
  //   EAGER-MOUNT (fixes "generation doesn't happen" + "commands don't run"
  //   + "chat redesign invisible"): for a fresh ?prompt= (and any active
  //   build — pending/building/live) mount <BuilderPage> IMMEDIATELY so its
  //   in-browser auto-prompt effect (BuilderPage ~L1007) fires. That effect
  //   drives the VISIBLE generation — it streams the build into the chat
  //   (file cards, shell/start status, the redesigned chat tree) AND the
  //   action-runner executes the emitted bolt shell/start actions
  //   (npm install && npm run dev) so the dev server boots and the preview
  //   loads. All of that was unreachable before because this wrapper parked
  //   the user on a <GenerateJobCard> spinner for the whole detached build —
  //   BuilderPage never mounted, the chat stayed empty, AutoStart bailed on
  //   `hasMessages`, and npm install/dev never ran.
  //
  //   The detached Convex job still runs in parallel (created above) as a
  //   survival backup: if the user closes the tab, the job completes
  //   server-side; on reopen its `live` files hydrate the WebContainer —
  //   gated in the effect above on workbenchStore.files being empty so it
  //   never clobbers the in-browser path's live files.
  //
  //   The GenerateJobCard is shown ONLY for an explicit retry of a
  //   failed/cancelled job (has a row + error/cancelled status). The active
  //   build is now owned end-to-end by the chat.
  const showCard =
    !!job._id && (job.status === 'error' || job.status === 'cancelled');

  if (showCard) {
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
