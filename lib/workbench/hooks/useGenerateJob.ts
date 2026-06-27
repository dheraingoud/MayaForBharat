'use client';
//
// useGenerateJob — reactive subscription to a generateJobs row for the workbench.
//
// Uses Convex's `useQuery_experimental` so the call returns the discriminated
// {status: 'pending'|'success'|'error'} union instead of throwing. Errors never
// bubble to the React error boundary (which would render /app/error.tsx and make
// the whole /workbench/[id] page look like a hard crash / 404). On 'error' we
// surface a synthetic "preparing" view the workbench can recover from.
//
// Returns the parsed GenerateJobView shape; downstream UI (GenerateJobCard /
// BuilderPageWithJob) doesn't change because the shape is identical.
//

import { useQuery_experimental as useQuery } from 'convex/react';
import type { FunctionReference, FunctionArgs } from 'convex/server';
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
  _id?: string | null;
  status: GenerateJobStatus;
  files: ParsedFile[] | null;
  error: string | null;
  progressNote: string | null;
  appId?: string | null;
  transientJob: {
    _id: string;
    status: GenerateJobStatus;
    progressNote: string | null;
    createdAt: number;
  } | null;
  /** Subscription hasn't returned a value yet — first hydration render. */
  isReady: boolean;
  /** Convex threw; consumers can surface this in a non-fatal banner. */
  queryError: string | null;
}

const EMPTY: GenerateJobView = {
  status: 'pending',
  files: null,
  error: null,
  progressNote: null,
  transientJob:null,
  isReady: true,
  queryError: null,
};

function decodeFiles(filesJson: unknown): ParsedFile[] | null {
  if (typeof filesJson !== 'string' || filesJson.length === 0) return null;
  try {
    const parsed = JSON.parse(filesJson);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (f) =>
        f != null &&
        typeof f.path === 'string' &&
        typeof f.content === 'string',
    );
  } catch {
    return null;
  }
}

export function useGenerateJob(
  appId: string | null | undefined,
): GenerateJobView {
  type Q = typeof api.generateJobs.getByAppId;
  const result = useQuery<Q>({
    query: api.generateJobs.getByAppId as Q & FunctionReference<'query'>,
    args:
      appId
        ? ({ appId } as unknown as FunctionArgs<Q>)
        : ('skip' as const),
  });

  // Subscription hasn't returned yet → render the loading state.
  if (result.status === 'pending') {
    return { ...EMPTY, isReady: false };
  }

  // Convex errored (function not deployed, schema drift, transient network).
  // Surface as a non-fatal "preparing" view so the React tree stays alive.
  if (result.status === 'error') {
    return {
      ...EMPTY,
      isReady: true,
      queryError: String((result as any).error?.message ?? result),
      progressNote: 'Connecting to build service…',
    };
  }

  // Success but no row exists for this appId yet.
  const row = (result as any).data as
    | (Record<string, unknown> & { filesJson?: string | null })
    | null
    | undefined;
  if (!row) return EMPTY;

  return {
    _id: (row._id as string | undefined) ?? null,
    appId: (row.appId as string | undefined) ?? null,
    status: (row.status as GenerateJobStatus) ?? 'pending',
    files: decodeFiles(row.filesJson),
    error: (row.error as string | null | undefined) ?? null,
    progressNote: (row.progressNote as string | null | undefined) ?? null,
    transientJob: (row.transientJob as GenerateJobView['transientJob']) ?? null,
    isReady: true,
    queryError: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _UnusedFnRef = FunctionReference<'query'>;
