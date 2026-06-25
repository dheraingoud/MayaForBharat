'use client';
//
// useGenerateJob — reactive subscription to a generateJobs row for the workbench.
//
// Uses Convex realtime via `useQuery`. Returns the latest known state of the
// generation job (status, files, error, progressNote) so the workbench UI can
// render the right view: building card / live mount / error retry / cancelled.
//
// Returns `isReady=false` while the subscription hasn't returned yet (first
// render after hydration). Once `isReady=true`, `status` is always defined —
// even if no row exists yet (we surface "pending" and the caller can choose
// to call useCreateGenerateJob to seed the row).
//

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export type GenerateJobStatus =
  | 'pending'
  | 'building'
  | 'live'
  | 'error'
  | 'cancelled';

export interface ParsedFile {
  path: string;
  content: string;
}

export interface GenerateJobView {
  _id?: any;
  status: GenerateJobStatus;
  files: ParsedFile[] | null;
  error: string | null;
  progressNote: string | null;
  appId?: string;
  transientJob: {
    _id: any;
    status: GenerateJobStatus;
    progressNote: string | null;
    createdAt: number;
  } | null;
  isReady: boolean;
}

const EMPTY: GenerateJobView = {
  status: 'pending',
  files: null,
  error: null,
  progressNote: null,
  transientJob: null,
  isReady: true,
};

export function useGenerateJob(appId: string | null | undefined): GenerateJobView {
  const job = useQuery(
    api.generateJobs.getByAppId,
    appId ? { appId } : 'skip',
  );

  // First render: still subscribing
  if (job === undefined) {
    return { ...EMPTY, isReady: false };
  }

  // No rows yet
  if (job === null) {
    return EMPTY;
  }

  // We got a row — decode filesJson defensively
  let files: ParsedFile[] | null = null;
  if (typeof job.filesJson === 'string' && job.filesJson.length > 0) {
    try {
      const parsed = JSON.parse(job.filesJson);
      if (Array.isArray(parsed)) {
        files = parsed.filter(
          (f) =>
            f != null &&
            typeof f.path === 'string' &&
            typeof f.content === 'string',
        );
      }
    } catch {
      files = null;
    }
  }

  return {
    _id: (job as any)._id ?? null,
    appId: (job as any).appId,
    status: (job as any).status as GenerateJobStatus,
    files,
    error: (job as any).error ?? null,
    progressNote: (job as any).progressNote ?? null,
    transientJob: (job as any).transientJob ?? null,
    isReady: true,
  };
}
