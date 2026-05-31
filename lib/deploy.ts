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
  /** 'production' maps custom domains, 'preview' creates a temporary URL */
  target?: 'production' | 'preview'
  vercelProjectId?: string
}

export interface DeployResult {
  url: string
  projectId: string
  success: boolean
  deploymentId?: string
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

async function injectScaffoldFiles(projectDir: string, projectName: string, target: 'production' | 'preview' = 'production'): Promise<void> {
  const STRICT_NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true }
}
module.exports = nextConfig`

  const PROD_NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true }
}
module.exports = nextConfig`

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
        'react': '^19.0.0',
        'react-dom': '^19.0.0',
        'next': '16.2.6',
        'lucide-react': '^0.453.0',
        'framer-motion': '^11.11.10',
        'recharts': '^3.0.0',
        'clsx': '^2.1.1',
        'tailwind-merge': '^2.5.4'
      },
      devDependencies: {
        'typescript': '^5',
        '@types/node': '^20',
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        'postcss': '^8',
        'tailwindcss': '^3.4.1',
        'autoprefixer': '^10.4.20'
      }
    }, null, 2),
    'next.config.js': target === 'preview' ? STRICT_NEXT_CONFIG : PROD_NEXT_CONFIG,
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
    '.npmrc': 'legacy-peer-deps=true',
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
  target = 'production',
  vercelProjectId,
}: DeployOptions): Promise<DeployResult> {
  const token = process.env.DEPLOY_TOKEN

  // Ensure project name is globally unique and safe for Vercel
  const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40)
  const uniqueProjectName = `${safeName}-${appId.slice(0, 8)}`

  // Inject required scaffold files and memory files
  await injectScaffoldFiles(directory, uniqueProjectName, target)
  await injectMemoryFiles(directory, memoryDir).catch(() => null)

  // ── Demo fallback ───
  if (!token) {
    return {
      url: `https://maya-app-${appId}.vercel.app`,
      projectId: `demo-${appId}-${Date.now()}`,
      success: true,
    }
  }

  const auth = { Authorization: `Bearer ${token}` }

  let project: { id: string; name: string }

  if (vercelProjectId) {
    // If we already have a vercelProjectId, just fetch the existing project
    const getRes = await fetch(`${VERCEL_API}/v9/projects/${vercelProjectId}`, {
      headers: auth,
    })
    if (!getRes.ok) {
      const err = await getRes.text()
      throw new Error(`Vercel project fetch by ID failed: ${getRes.status} ${err}`)
    }
    project = await getRes.json()
  } else {
    // Project doesn't exist yet, create it
    const createBody: any = {
      name: uniqueProjectName,
      framework: 'nextjs',
    }

    // Pass along critical environment variables from the host to the Vercel project
    const envVarsToForward = [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_CLERK_SIGN_IN_URL',
      'NEXT_PUBLIC_CLERK_SIGN_UP_URL',
      'NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL',
      'NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL'
    ]

    const environmentVariables = envVarsToForward
      .filter(key => process.env[key])
      .map(key => ({
        key,
        value: process.env[key],
        type: 'plain',
        target: ['production', 'preview', 'development']
      }))

    if (environmentVariables.length > 0) {
      createBody.environmentVariables = environmentVariables
    }

    const createRes = await fetch(`${VERCEL_API}/v10/projects`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    })

    if (!createRes.ok) {
      // If it already exists by name, just fetch it
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
    files: fileBlobs,
    gitMetadata: {
      remoteUrl: '',
      commitRef: '',
      commitMessage: `deploy: ${uniqueProjectName}`,
    },
    framework: 'nextjs',
    target: target === 'preview' ? 'staging' : target,
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

  // If this is a preview deploy, poll for success. If it fails, return false success
  if (target === 'preview' && deployJson.id) {
    const buildSuccess = await pollDeployment(deployJson.id, token)
    if (!buildSuccess) {
      return {
        url: `https://${deployJson.url || `${uniqueProjectName}.vercel.app`}`,
        projectId: project.id,
        success: false,
        deploymentId: deployJson.id,
      }
    }
  }

  return {
    url: `https://${deployJson.url || `${uniqueProjectName}.vercel.app`}`,
    projectId: project.id,
    success: true,
    deploymentId: deployJson.id,
  }
}

// ── Poll Vercel Deployment ───────────────────────────────────────────────────

export async function pollDeployment(deploymentId: string, token: string): Promise<boolean> {
  let attempts = 0
  while (attempts < 60) { // Max 2 minutes (2s interval)
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (!res.ok) continue
    
    const data = await res.json()
    if (data.readyState === 'READY') return true
    if (data.readyState === 'ERROR' || data.readyState === 'CANCELED') return false
    
    attempts++
  }
  return false
}

// ── Fetch Vercel Deployment Logs ─────────────────────────────────────────────

export async function getDeploymentLogs(deploymentId: string, token: string): Promise<string> {
  try {
    const res = await fetch(`${VERCEL_API}/v2/deployments/${deploymentId}/events`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (!res.ok) return 'Failed to fetch logs from Vercel.'
    
    const text = await res.text()
    const logs: string[] = []
    const lines = text.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      let data: any = null
      
      if (trimmed.startsWith('data: ')) {
        try { data = JSON.parse(trimmed.slice(6)) } catch (e) {}
      } else if (trimmed.startsWith('{')) {
        try { data = JSON.parse(trimmed) } catch (e) {}
      }
      
      if (data && (data.type === 'stdout' || data.type === 'stderr' || data.type === 'command')) {
        const payloadText = data.payload?.text || data.payload?.message || ''
        if (payloadText) logs.push(payloadText)
      }
    }
    
    return logs.join('')
  } catch (e) {
    console.error('[deploy] Error fetching deployment logs:', e)
    return 'Error fetching logs.'
  }
}

// ── Delete Vercel Project ─────────────────────────────────────────────────────

export async function deleteVercelProject(projectId: string): Promise<boolean> {
  const token = process.env.DEPLOY_TOKEN
  if (!token) return true // Mock mode success

  try {
    const res = await fetch(`${VERCEL_API}/v9/projects/${projectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok && res.status !== 404) {
      console.warn(`[deploy] Failed to delete Vercel project ${projectId}: ${res.status}`)
      return false
    }
    return true
  } catch (e) {
    console.warn('[deploy] Error deleting Vercel project:', e)
    return false
  }
}

// ── Delete Vercel Deployment (for cleaning up previews) ───────────────────

export async function deleteVercelDeployment(deploymentUrlOrId: string): Promise<boolean> {
  const token = process.env.DEPLOY_TOKEN
  if (!token) return true // Mock mode success

  try {
    // Extract ID or domain name
    const id = deploymentUrlOrId.replace('https://', '').split('.')[0]
    
    const res = await fetch(`${VERCEL_API}/v13/deployments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      console.warn(`[deploy] Failed to delete preview ${id}: ${res.status}`)
      return false
    }
    return true
  } catch (e) {
    console.warn('[deploy] Error deleting preview:', e)
    return false
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

      // Skip node_modules, build outputs, and hidden files (EXCEPT .npmrc)
      if (entry.name === 'node_modules') continue
      if (entry.name === '.next') continue
      if (entry.name === 'dist') continue
      if (entry.name.startsWith('.') && entry.name !== '.npmrc') continue

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
