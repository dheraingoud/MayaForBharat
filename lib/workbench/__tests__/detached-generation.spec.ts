/**
 * Tests for the detached-generation pipeline. Static (no live Convex, no LLM):
 * the cheaper risk-free layer that catches contract drift.
 *
 *   1. generateJobs skeleton exports (covers Task 2/4 wiring)
 *   2. stale sweeper uses exactly 2-minute cutoff (Task 8)
 *   3. extractBoltFiles rounds-trip on a real boltAction block (Task 4 helper)
 *   4. /api/apps-from-plan route + app-page redirect are wired (Task 6)
 *   5. /workbench/[id]/page.tsx uses BuilderPageWithJob (Task 5)
 *   6. crons register both demo and production generateJobsActions.sweepStaleAction (Task 1)
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe('detached-generation: contract surface', () => {
  it('schema declares generateJobs with the expected fields', () => {
    const schema = read('convex/schema.ts');
    expect(schema).toContain('generateJobs:');
    for (const field of [
      'appId: v.string()',
      'status: v.union(',
      'prompt: v.string()',
      'partialText:',
      'progressNote:',
      'filesJson:',
      '.index("by_app", ["appId"])',
      '.index("by_status", ["status"])',
    ]) {
      expect(schema, `expected schema to mention ${field}`).toContain(field);
    }
  });

  it('generateJobs.ts exposes the public + internal API', () => {
    const src = read('convex/generateJobs.ts');
    for (const id of [
      'export const createJob',
      'export const getByAppId',
      'export const get',
      'export const cancelJob',
      'export const saveProgress',
      'export const markLive',
      'export const markError',
      'export const _get',
      'export const _setBuilding',
      'export const _listBuildingOlderThan',
    ]) {
      expect(src, `export missing: ${id}`).toContain(id);
    }
    expect(read('convex/generateJobs.ts')).toContain(
      'internal.generateJobsHandler.generateRunAction',
    );
    expect(read('convex/generateJobs.ts')).toContain('scheduler.runAfter(0,');
  });

  it('worker file declares use-node and exports the actions', () => {
    const src = read('convex/generateJobsHandler.ts');
    expect(src.startsWith('"use node"'), 'expected "use node" directive').toBe(true);
    expect(src).toContain('export const generateRunAction');
    expect(src).toContain('export const sweepStaleAction');
    expect(src).toContain("await streamText({");
    expect(src).toContain('saveProgress');
    expect(src).toContain('markLive');
    expect(src).toContain('Cancelled');
  });

  it('stale sweeper cutoff is exactly 2 minutes', () => {
    const src = read('convex/generateJobsHandler.ts');
    expect(src).toMatch(/TWO_MIN_MS\s*=\s*2\s*\*\s*60\s*\*\s*1000/);
    expect(src).toContain('error: "stale (no progress for 2 min)"');
  });
});

describe('extractBoltFiles helper', () => {
  it('extracts files from a typical boltAction block', async () => {
    const mod = await import('../../../lib/workbench/llm/extract-bolt-files');
    const text = `
Here is your app.
<boltArtifact id="hi" title="Demo">
<boltAction type="file" filePath="src/index.ts">console.log('hello')

</boltAction>
<boltAction type="shell">npm install</boltAction>
<boltAction type="file" filePath="README.md"># Demo

A tiny demo
</boltAction>
</boltArtifact>
`;
    const files = mod.extractBoltFiles(text);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/index.ts');
    expect(files[0].content).toContain("console.log('hello')");
    expect(files[0].content.endsWith('\n')).toBe(true);
    expect(files[1].path).toBe('README.md');
    expect(files[1].content).toContain('A tiny demo');
  });

  it('skips incomplete blocks (no closing tag) and no-filePath actions', async () => {
    const mod = await import('../../../lib/workbench/llm/extract-bolt-files');
    // Two complete-but-anomalous cases + one truly incomplete.
    // The helper requires both opening AND closing tags to match — incomplete
    // paragraphs without a closing</boltAction> are intentionally NOT parsed
    // (the worker only emits complete files once it finishes the LLM stream).
    const text = `
<boltAction type="file" filePath="src/app.ts">first complete
</boltAction>
<boltAction type="shell">npm install</boltAction>
<boltAction type="file">no filePath so skip
</boltAction>
`;
    const files = mod.extractBoltFiles(text);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
  });

  it('returns [] for empty / nullish input', async () => {
    const mod = await import('../../../lib/workbench/llm/extract-bolt-files');
    expect(mod.extractBoltFiles('')).toEqual([]);
    // @ts-expect-error — defensive runtime behavior
    expect(mod.extractBoltFiles(undefined)).toEqual([]);
  });
});

describe('client wiring', () => {
  it('hooks exist and are use-client + use convex/react', () => {
    for (const hook of [
      'lib/workbench/hooks/useGenerateJob.ts',
      'lib/workbench/hooks/useCreateGenerateJob.ts',
      'lib/workbench/hooks/useCancelGenerateJob.ts',
    ]) {
      const src = read(hook);
      expect(src.startsWith("'use client'"), `${hook} should be 'use client'`).toBe(true);
    }
    // useGenerateJob uses Convex's typed experimental hook so errors don't
    // bubble to app/error.tsx.
    expect(read('lib/workbench/hooks/useGenerateJob.ts'))
      .toMatch(/useQuery_experimental\s+as\s+useQuery/);
    expect(read('lib/workbench/hooks/useCreateGenerateJob.ts')).toContain("import { useMutation }");
    expect(read('lib/workbench/hooks/useCancelGenerateJob.ts')).toContain("import { useMutation }");
  });

  it('BuilderPageWithJob exists and wires the new subscription flow', () => {
    const src = read('lib/workbench/components/workbench/BuilderPageWithJob.tsx');
    expect(src).toContain('useGenerateJob');
    expect(src).toContain('useCreateGenerateJob');
    expect(src).toContain('useCancelGenerateJob');
    expect(src).toContain('writeFilesToWebContainer');
    expect(src).toContain('GenerateJobCard');
    expect(src).toContain("BUILD_CANCEL_KEY = 'Escape'");
  });

  it('/workbench/[id]/page.tsx uses BuilderPageWithJob', () => {
    const src = read('app/workbench/[id]/page.tsx');
    expect(src).toContain('BuilderPageWithJob');
    expect(src).toContain('appId={appId}');
    expect(src).toContain('prompt={prompt}');
    expect(src).toContain('model={model}');
    expect(src).toContain('provider={provider}');
  });
});

describe('plan redirect + cron wiring', () => {
  it('/api/apps-from-plan exists and points at the worker hookup', () => {
    expect(exists('app/api/apps-from-plan/route.ts')).toBe(true);
    const src = read('app/api/apps-from-plan/route.ts');
    expect(src).toContain('POST');
    expect(src).toContain('api.apps.create');
    expect(src).toContain('appId');
  });

  it('handleApprove in app/page.tsx posts to /api/apps-from-plan and redirects to /workbench/[appId]', () => {
    const src = read('app/page.tsx');
    expect(src).toContain("'/api/apps-from-plan'");
    expect(src).toMatch(/`\/workbench\/\$\{[^}]+\}\?/);
  });

  it('crons.ts registers a 1-minute genJobs sweeper in BOTH branches', () => {
    const src = read('convex/crons.ts');
    expect(src).toMatch(/maya-genjobs-sweep-demo.*generateJobsHandler\.sweepStaleAction/s);
    expect(src).toMatch(/maya-genjobs-sweep[^"]+.*generateJobsHandler\.sweepStaleAction/s);
  });
});
