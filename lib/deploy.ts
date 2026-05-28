/**
 * Vercel programmatic deploy helper for MAYA
 *
 * Creates a Vercel project via REST API, uploads app code,
 * injects AGENTS.md + MAYA.md, and returns the live preview URL.
 *
 * Falls back gracefully to a mock URL when DEPLOY_TOKEN is missing
 * so hackathon demos stay functional.
 */

import { promises as fs } from 'fs'
import path from 'path'

const VERCEL_API = 'https://api.vercel.com'

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeployOptions {
  appId: string
  projectName: string
  directory: string
  memoryDir?: string
}

export interface DeployResult {
  url: string
  projectId: string
}

// ── Helper: inject AGENTS.md + MAYA.md into project root ─────────────────

async function injectMemoryFiles(
  projectDir: string,
  memoryDir?: string
): Promise<void> {
  // Memory files live either in the app directory or an explicit override path
  const sourceDir = memoryDir || path.join(projectDir, 'lib', 'memory')
  const files = ['AGENTS.md', 'MAYA.md']

  for (const file of files) {
    try {
      const src = path.join(sourceDir, file)
      const stats = await fs.stat(src)
      if (stats.isFile()) {
        await fs.copyFile(src, path.join(projectDir, file))
      }
    } catch {
      // Best-effort injection — don't block deploy if memory files missing
    }
  }
}

// ── Helper: inject Next.js scaffold files ──────────────────────────────────

async function injectScaffoldFiles(projectDir: string, projectName: string): Promise<void> {
  const scaffold = {
    'package.json': JSON.stringify({
      name: projectName,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint'
      },
      dependencies: {
        'react': '^18',
        'react-dom': '^18',
        'next': '15.0.0-rc.0',
        'lucide-react': '^0.453.0',
        'framer-motion': '^11.11.10'
      },
      devDependencies: {
        'typescript': '^5',
        '@types/node': '^20',
        '@types/react': '^18',
        '@types/react-dom': '^18',
        'postcss': '^8',
        'tailwindcss': '^3.4.1'
      }
    }, null, 2),
    'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
}
module.exports = nextConfig`,
    'tailwind.config.ts': `import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [],
}
export default config`,
    'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
    'tsconfig.json': JSON.stringify({
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
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./*'] }
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules']
    }, null, 2),
    'app/error.tsx': `'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F4F0] p-4 text-center" style={{ fontFamily: 'sans-serif' }}>
      <div className="rounded-3xl bg-white p-8 shadow-sm border border-[#E4E1DA] max-w-md w-full">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
        </div>
        <h2 className="text-xl font-bold text-[#1A1917] mb-2">Something went wrong!</h2>
        <p className="text-sm text-[#6B6560]">
          There was an error rendering this UI. Tell MAYA to "fix the error" in the chat.
        </p>
      </div>
    </div>
  )
}`
  }

  for (const [filename, content] of Object.entries(scaffold)) {
    const dest = path.join(projectDir, filename)
    // Only write if model didn't provide one
    if (!await fs.stat(dest).catch(() => false)) {
      await fs.writeFile(dest, content, 'utf-8')
    }
  }
}

// ── Deploy to Vercel ───────────────────────────────────────────────────────

export async function deployToVercel({
  appId,
  projectName,
  directory,
  memoryDir,
}: DeployOptions): Promise<DeployResult> {
  const token = process.env.DEPLOY_TOKEN

  // Ensure project name is globally unique and safe for Vercel
  const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40)
  const uniqueProjectName = `${safeName}-${appId.slice(0, 8)}`

  // Inject required scaffold files and memory files
  await injectScaffoldFiles(directory, uniqueProjectName)
  await injectMemoryFiles(directory, memoryDir).catch(() => null)

  // ── Demo fallback ───
  if (!token) {
    return {
      url: `https://maya-app-${appId}.vercel.app`,
      projectId: `demo-${appId}-${Date.now()}`,
    }
  }

  const auth = { Authorization: `Bearer ${token}` }

  // ── Step 1: Create or fetch Vercel project ───
  let project: { id: string; name: string }
  
  const createRes = await fetch(`${VERCEL_API}/v10/projects`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: uniqueProjectName,
      framework: 'nextjs',
    }),
  })

  if (!createRes.ok) {
    // If it already exists, just fetch it
    if (createRes.status === 409) {
      const getRes = await fetch(`${VERCEL_API}/v9/projects/${uniqueProjectName}`, {
        headers: auth,
      })
      if (!getRes.ok) {
        const err = await getRes.text()
        throw new Error(`Vercel project fetch failed: ${getRes.status} ${err}`)
      }
      project = await getRes.json()
    } else {
      const err = await createRes.text()
      throw new Error(`Vercel project create failed: ${createRes.status} ${err}`)
    }
  } else {
    project = await createRes.json()
  }

  // ── Step 2: Upload files -> get source files array ──
  // For hackathon brevity: collect all files in directory recursively.
  const fileMap = await collectFiles(directory)
  const fileBlobPromises = Array.from(fileMap.entries()).map(
    async ([filePath, absPath]) => {
      const content = await fs.readFile(absPath, 'utf-8')
      return {
        data: Buffer.from(content).toString('base64'),
        file: filePath,
        encoding: 'base64' as const,
      }
    }
  )
  const fileBlobs = await Promise.all(fileBlobPromises)

  // ── Step 3: Create deployment ───
  const deployBody = {
    name: uniqueProjectName,
    projectId: project.id,
    files: fileBlobs,
    gitMetadata: {
      remoteUrl: '',
      commitRef: '',
      commitMessage: `deploy: ${uniqueProjectName}`,
    },
    framework: 'nextjs',
    target: 'production',
  }

  const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(deployBody),
  })

  if (!deployRes.ok) {
    const err = await deployRes.text()
    throw new Error(`Vercel deploy failed: ${deployRes.status} ${err}`)
  }

  const deployJson = (await deployRes.json()) as {
    url?: string
    id?: string
  }

  return {
    url: `https://${deployJson.url || `${uniqueProjectName}.vercel.app`}`,
    projectId: project.id,
  }
}

// ── Helper: collect all text files recursively ─────────────────────────────

async function collectFiles(dir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  async function walk(current: string, prefix: string) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name

      // Skip hidden files, node_modules, build outputs
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules') continue
      if (entry.name === '.next') continue
      if (entry.name === 'dist') continue

      if (entry.isDirectory()) {
        await walk(full, rel)
      } else {
        result.set(rel, full)
      }
    }
  }

  await walk(dir, '')
  return result
}
