/**
 * /api/deploy-smoke — exercises the Vercel deploy pipeline with a hardcoded
 * minimal Next.js app, NO model required.
 *
 * USE: verify deploy.ts end-to-end after wiring changes. Returns:
 *   { success, url, projectId, deploymentId?, mockMode, error? }
 *
 * Behavior:
 *   - If DEPLOY_TOKEN env is set: real Vercel project + real preview deploy
 *   - If missing: returns mockMode:true with a fake URL
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { deployToVercel, healthCheck } from '@/lib/deploy';

export const runtime = 'nodejs';

const FIXTURE_APP_ID = 'smoke';

const PACKAGE_JSON = JSON.stringify(
  {
    name: 'maya-smoke',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      next: '16.2.6',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      typescript: '^5',
      '@types/node': '^20',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      postcss: '^8',
      tailwindcss: '^3.4.1',
      autoprefixer: '^10.4.20',
    },
  },
  null,
  2,
);

const TSCONFIG_JSON = JSON.stringify(
  {
    compilerOptions: {
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: false,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  },
  null,
  2,
);

const NEXT_CONFIG_JS = [
  "/** @type {import('next').NextConfig} */",
  'const nextConfig = {};',
  'module.exports = nextConfig;',
].join('\n');

const LAYOUT_TSX = [
  "export const metadata = { title: 'MAYA smoke' };",
  'export default function RootLayout({ children }) {',
  '  return (',
  '    <html lang="en">',
  '      <body>{children</body>',
  ' </html>',
  '  );',
  '}',
].join('\n');

const PAGE_TSX = [
  'export default function Home() {',
  '  return (',
  "    <main style={{ fontFamily: 'sans-serif', padding: 40 }}>",
  '      <h1>MAYA smoke test</h1>',
  '      <p>If you can see this, deploy pipeline reached a real URL</p>',
  ' </main>',
  '  );',
  '}',
].join('\n');

async function writeFixture(root: string) {
  const files: Record<string, string> = {
    'package.json': PACKAGE_JSON,
    'tsconfig.json': TSCONFIG_JSON,
    'next.config.js': NEXT_CONFIG_JS,
    'app/layout.tsx': LAYOUT_TSX,
    'app/page.tsx': PAGE_TSX,
    '.npmrc': 'legacy-peer-deps=true',
  };

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const target = (body.target as 'preview' | 'production') ?? 'preview';
    const projectName =
      (body.projectName as string) ?? `maya-smoke-${Date.now().toString(36)}`;

    const root = path.join(process.cwd(), 'builds', `_smoke-${FIXTURE_APP_ID}`);
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });
    await writeFixture(root);

    let result;
    let deployError: string | null = null;
    try {
      result = await deployToVercel({
        appId: FIXTURE_APP_ID,
        projectName,
        directory: root,
        target,
      });
    } catch (e) {
      deployError = e instanceof Error ? e.message : String(e);
    }

    if (deployError || !result) {
      return NextResponse.json(
        {
          success: false,
          error: deployError ?? 'deploy returned no result',
          elapsedMs: Date.now() - startedAt,
          tokenSet: !!process.env.DEPLOY_TOKEN,
        },
        { status: deployError ? 502 : 500 },
      );
    }

    let health: { passed: boolean; statusCode: number; error?: string } | null = null;
    if (!result.mockMode) {
      try {
        health = await healthCheck(result.url);
      } catch (e) {
        health = {
          passed: false,
          statusCode: 0,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return NextResponse.json({
      success: result.success,
      url: result.url,
      projectId: result.projectId,
      deploymentId: result.deploymentId,
      mockMode: result.mockMode ?? false,
      health,
      elapsedMs: Date.now() - startedAt,
      tokenSet: !!process.env.DEPLOY_TOKEN,
      target,
      projectName,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('[api/deploy-smoke]', error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    info: 'POST to /api/deploy-smoke to run the deploy pipeline against a hardcoded Next.js fixture.',
    method: 'POST',
    bodyShape: { target: 'preview|production', projectName: 'optional string' },
    tokenSet: !!process.env.DEPLOY_TOKEN,
  });
}
