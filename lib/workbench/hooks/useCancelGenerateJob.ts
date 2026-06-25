'use client';
//
// useCancelGenerateJob — flip a building/pending job to cancelled.
//
// The worker checks status between progress saves (every progress save hit
// AND every 7s of streaming time). It exits cleanly via markError('cancelled')
// when it sees the cancelled state, so the row appears terminal in the UI.
//

import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '@/convex/_generated/api';

export function useCancelGenerateJob() {
  const cancelJob = useMutation(api.generateJobs.cancelJob);

  return useCallback(
    async (jobId: string | null | undefined) => {
      if (!jobId) return { ok: false, error: 'no jobId' };
      const result = await cancelJob({ jobId: jobId as any });
      return result;
    },
    [cancelJob],
  );
}
