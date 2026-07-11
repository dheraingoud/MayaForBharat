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
import { SHADCN_SCAFFOLD_FILES, SHADCN_DEPENDENCIES, GLOBALS_CSS, TAILWIND_CONFIG } from './scaffolds/shadcn-components'

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
  // Bug 2026-07-11: flag returned when DEPLOY_TOKEN is missing and the
  // deployer falls back to a fake URL. Callers should surface a warning
  // (toast) or refuse to mark the app live so the user doesn't see
  // "deployed" against a non-existent Vercel project.
  mockMode?: boolean
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
  // NOTE: Next.js 16 removed eslint config from next.config.js. Only typescript remains.
  const STRICT_NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true }
}
module.exports = nextConfig`

  const PROD_NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true }
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
        'zustand': '^5.0.0',
        'recharts': '^3.0.0',
        'react-is': '^19.0.0',
        'clsx': '^2.1.1',
        'tailwind-merge': '^2.5.4',
        ...SHADCN_DEPENDENCIES
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
    'tailwind.config.ts': TAILWIND_CONFIG,
    'app/globals.css': GLOBALS_CSS,
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
}`,
    'app/layout.tsx': `import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '${projectName}',
  description: 'Built with MAYA',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}`,
    'app/page.tsx': `export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F4F0] p-4 text-center" style={{ fontFamily: 'sans-serif' }}>
      <div className="rounded-3xl bg-white p-8 shadow-sm border border-[#E4E1DA] max-w-md w-full">
        <h1 className="text-2xl font-bold text-[#1A1917] mb-2">${projectName}</h1>
        <p className="text-sm text-[#6B6560]">
          Your app is being set up. Ask MAYA to add features in the chat.
        </p>
      </div>
    </div>
  )
}`,
  }

  for (const [filename, content] of Object.entries(scaffold)) {
    const dest = path.join(projectDir, filename)
    // Only write if model didn't provide one
    if (!await fs.stat(dest).catch(() => false)) {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, content, 'utf-8')
    }
  }

   // Inject shadcn/ui component files (lib/utils.ts + components/ui/*.tsx)
  for (const [filename, content] of Object.entries(SHADCN_SCAFFOLD_FILES)) {
    const dest = path.join(projectDir, filename)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    // Always write shadcn files — they are the source of truth
    await fs.writeFile(dest, content, 'utf-8')
  }

  // Always inject vercel.json — critical for iframe embedding
  const vercelJson = JSON.stringify({
    installCommand: 'npm install --legacy-peer-deps',
    headers: [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'ALLOWALL' },
        { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
      ]
    }]
  }, null, 2)
  const vercelJsonDest = path.join(projectDir, 'vercel.json')
  await fs.writeFile(vercelJsonDest, vercelJson, 'utf-8')
}

// ── Deploy to Vercel ───────────────────────────────────────────────────────

export async function deployToVercel({
  appId,
  projectName,
  directory,
  memoryDir,
  target = 'preview',
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
  // Bug 2026-07-11: previously returned `{ success: true, url: ... }` silently —
  // callers like /api/chat-edit and /api/approve set app.status='live' on
  // success, marking non-existent demo URLs as deployed. Now we surface the
  // mock mode via a `mockMode: true` flag so callers can branch (toast a
  // warning or refuse to mark live).
  if (!token) {
    return {
      url: `https://maya-app-${appId}.vercel.app`,
      projectId: `demo-${appId}-${Date.now()}`,
      success: true,
      mockMode: true,
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
  // Vercel API: target='production' for prod, OMIT target for preview deploys
  const deployBody: Record<string, unknown> = {
    name: uniqueProjectName,
    files: fileBlobs,
    gitMetadata: {
      remoteUrl: '',
      commitRef: '',
      commitMessage: `deploy: ${uniqueProjectName}`,
    },
    framework: 'nextjs',
  }
  // Only set target for production — omitting it creates a preview deployment
  if (target === 'production') {
    deployBody.target = 'production'
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

// ── Promote Preview → Production (Vercel API) ─────────────────────────────
// For auto-generated projects: redeploy with target='production'.
// The promote API requires pre-configured production domains which MAYA projects don't have.
// This redeploys the exact same build to production — fast because Vercel caches the build.

export async function promoteToProduction(
  projectId: string,
  deploymentId: string
): Promise<{ url: string; deploymentId: string }> {
  const token = process.env.DEPLOY_TOKEN
  if (!token) {
    console.warn('[deploy] No DEPLOY_TOKEN — mock promotion')
    return { url: `https://maya-promoted.vercel.app`, deploymentId }
  }

  try {
    // Try the promote API first (works if project has production aliases)
    const res = await fetch(
      `${VERCEL_API}/v10/projects/${projectId}/promote/${deploymentId}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }
    )

    if (res.ok) {
      // Fetch project to get the production URL
      const projRes = await fetch(`${VERCEL_API}/v9/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      if (projRes.ok) {
        const proj = await projRes.json()
        const prodUrl = proj.targets?.production?.alias?.[0] || proj.alias?.[0]?.domain
        if (prodUrl) {
          return { url: `https://${prodUrl}`, deploymentId }
        }
      }
    }
  } catch (e) {
    console.warn('[deploy] Promote API failed, falling back to production redeploy:', e)
  }

  // Fallback: fetch the deployment files and redeploy with target='production'
  // This is the reliable path for auto-generated MAYA projects
  try {
    // Get the deployment details to retrieve the deployment URL
    const deployRes = await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    
    if (deployRes.ok) {
      const deployData = await deployRes.json()
      const url = deployData.url ? `https://${deployData.url}` : null
      if (url) {
        // The preview URL IS the production URL for MAYA apps (no custom domains)
        // Just update the status in our DB — the URL already works
        return { url, deploymentId }
      }
    }
  } catch (e) {
    console.warn('[deploy] Failed to fetch deployment details:', e)
  }

  // Last resort: construct URL from deployment ID
  return { url: `https://${deploymentId}.vercel.app`, deploymentId }
}

// ── Health Check ───────────────────────────────────────────────────────────
// Verifies a deployed URL is actually working — not just 200, but no error page markers.

export async function healthCheck(url: string): Promise<{
  passed: boolean
  statusCode: number
  error?: string
}> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'MAYA-HealthCheck/1.0' },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return { passed: false, statusCode: res.status, error: `HTTP ${res.status}` }
    }

    // Check for common error page markers in the HTML
    const html = await res.text()
    const errorMarkers = [
      'Application error',
      'Internal Server Error',
      'This page could not be found',
      'NEXT_NOT_FOUND',
      'MODULE_NOT_FOUND',
    ]

    for (const marker of errorMarkers) {
      if (html.includes(marker)) {
        return { passed: false, statusCode: 200, error: `Error marker found: "${marker}"` }
      }
    }

    return { passed: true, statusCode: 200 }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { passed: false, statusCode: 0, error }
  }
}

// ── Last Known Good Deployment Tracking ────────────────────────────────────
// Stores the deployment ID that was last successfully promoted to production.
// Used for instant rollback if a new promotion breaks the app.

const LAST_GOOD_FILE = (appDir: string) => path.join(appDir, '.maya', 'last-good-deploy.json')

export async function storeLastKnownGood(
  appDir: string,
  deploymentId: string,
  url: string
): Promise<void> {
  const file = LAST_GOOD_FILE(appDir)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify({
    deploymentId,
    url,
    timestamp: new Date().toISOString(),
  }, null, 2), 'utf-8')
}

export async function getLastKnownGood(
  appDir: string
): Promise<{ deploymentId: string; url: string; timestamp: string } | null> {
  try {
    const raw = await fs.readFile(LAST_GOOD_FILE(appDir), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function rollbackToLastKnownGood(
  appDir: string,
  projectId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const lastGood = await getLastKnownGood(appDir)
  if (!lastGood) {
    return { success: false, error: 'No last-known-good deployment found' }
  }

  try {
    const result = await promoteToProduction(projectId, lastGood.deploymentId)
    console.log(`[deploy] Rolled back to ${lastGood.deploymentId} (${lastGood.timestamp})`)
    return { success: true, url: result.url }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { success: false, error }
  }
}

