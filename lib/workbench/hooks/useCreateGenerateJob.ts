'use client';
//
// useCreateGenerateJob — submit a generation job for an existing appId.
//
// Wraps `useMutation(api.generateJobs.createJob)` from convex/react. Returns a
// callback the caller can fire from a useEffect or an "onClick" handler.
//
// On success: returns `{ jobId }` so the caller can show a toast or log it.
// On failure: throws — callers should wrap in try/catch and toast.
//

import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '@/convex/_generated/api';

export interface CreateGenerateJobInput {
  appId: string;
  prompt: string;
  model: string;
  provider: string;
}

export function useCreateGenerateJob() {
  const createJob = useMutation(api.generateJobs.createJob);

  return useCallback(
    async (args: CreateGenerateJobInput) => {
      if (!args.appId || !args.appId.trim()) {
        throw new Error('useCreateGenerateJob: appId is required');
      }
      if (!args.prompt || !args.prompt.trim()) {
        throw new Error('useCreateGenerateJob: prompt is required');
      }

      const jobId = await createJob({
        appId: args.appId,
        prompt: args.prompt,
        model: args.model,
        provider: args.provider,
      });
      return jobId;
    },
    [createJob],
  );
}
