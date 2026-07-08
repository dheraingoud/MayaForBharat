'use client';

/*
 * useDeployedPreview — reactive read of an app's deployed-preview state.
 *
 * Returns the apps row's `vercelUrl` + whether `status === 'deployed'`, so a
 * reopened project can show its deployed Vercel preview directly instead of
 * booting a fresh local WebContainer dev server (Bug 2026-07-08). Uses the same
 * `useQuery_experimental` skip convention as useGenerateJob so an undefined
 * appId (first paint) doesn't fire a query.
 */

import { useQuery_experimental as useQuery } from 'convex/react';
import { FunctionArgs, FunctionReference } from 'convex/server';
import { api } from '@/convex/_generated/api';

export interface DeployedPreviewView {
  isReady: boolean;
  isDeployed: boolean;
  vercelUrl: string | null;
  deploymentId: string | null;
  docId: string | null;
}

const EMPTY: DeployedPreviewView = {
  isReady: false,
  isDeployed: false,
  vercelUrl: null,
  deploymentId: null,
  docId: null,
};

export function useDeployedPreview(
  appId: string | null | undefined,
): DeployedPreviewView {
  type Q = typeof api.apps.getByAppId;
  const result = useQuery<Q>({
    query: api.apps.getByAppId as Q & FunctionReference<'query'>,
    args:
      appId
        ? ({ appId } as unknown as FunctionArgs<Q>)
        : ('skip' as const),
  });

  if (result.status === 'pending') {
    return { ...EMPTY, isReady: false };
  }

  if (result.status === 'error') {
    return { ...EMPTY, isReady: true };
  }

  const row = (result as any).data as
    | (Record<string, unknown> & {
        _id?: string | null;
        vercelUrl?: string | null;
        deploymentId?: string | null;
        status?: string | null;
      })
    | null
    | undefined;

  if (!row) return { ...EMPTY, isReady: true };

  return {
    isReady: true,
    isDeployed: row.status === 'deployed',
    vercelUrl: (row.vercelUrl as string | undefined) ?? null,
    deploymentId: (row.deploymentId as string | undefined) ?? null,
    docId: (row._id as string | undefined) ?? null,
  };
}
