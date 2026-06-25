'use client';

import dynamic from 'next/dynamic';
import { useParams, useSearchParams } from 'next/navigation';

/*
 * /workbench/[id] — entry for the new detached-generation flow.
 *
 * If the URL carries the original plan prompt/model/provider as query params,
 * we forward them to BuilderPageWithJob; that wrapper:
 *   1. submits a new generateJobs row on first mount
 *   2. shows <GenerateJobCard> while pending/building
 *   3. writes files into WebContainer when the row reaches `live`
 *   4. then hands off to the existing BuilderPage for editing
 *
 * If the user lands here WITHOUT ?prompt=, the wrapper skips (1),
 * useGenerateJob finds the existing `live` row (from a prior build), and we
 * jump straight to step 3. This is the "come back later, my build is here" path.
 */

const BuilderPageWithJob = dynamic(
  () => import('@/lib/workbench/components/workbench/BuilderPageWithJob').then((m) => ({
    default: m.BuilderPageWithJob,
  })),
  { ssr: false },
);

export default function WorkbenchAppPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const appId = (params.id as string) ?? '';

  const prompt = searchParams?.get('prompt') ?? null;
  const model = searchParams?.get('model') ?? null;
  const provider = searchParams?.get('provider') ?? null;

  return (
    <BuilderPageWithJob
      appId={appId}
      prompt={prompt}
      model={model}
      provider={provider}
    />
  );
}
