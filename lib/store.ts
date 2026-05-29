/**
 * MAYA App Store — Simple JSON persistence for built app metadata.
 * No DB needed for prototype. Apps saved as JSON metadata + file tree.
 */

import { promises as fs } from 'fs'
import path from 'path'

export interface BuiltApp {
  id: string
  name: string
  nameHindi: string
  descriptionEn: string
  category: string
  url: string
  projectId: string
  createdAt: string
  status: 'live' | 'building'
  adminUsername?: string
  adminPin?: string
  shownToOwner?: boolean
  files: Array<{ path: string; content: string }>
}

const STORE_PATH = path.join(process.cwd(), '.maya-builds', 'apps.json')

function getAppDir(id: string): string {
  return path.join(process.cwd(), '.maya-builds', id)
}

export async function readStore(): Promise<BuiltApp[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function writeStore(apps: BuiltApp[]): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
  await fs.writeFile(STORE_PATH, JSON.stringify(apps, null, 2), 'utf-8')
}

export async function addApp(app: BuiltApp): Promise<void> {
  const apps = await readStore()
  // Remove if exists (update)
  const existing = apps.filter((a) => a.id !== app.id)
  existing.unshift(app)
  await writeStore(existing)
}

export async function getApp(id: string): Promise<BuiltApp | null> {
  const apps = await readStore()
  return apps.find((a) => a.id === id) || null
}

export async function removeApp(id: string): Promise<void> {
  const apps = await readStore()
  await writeStore(apps.filter((a) => a.id !== id))
}

export async function readAppFiles(
  id: string
): Promise<Array<{ path: string; content: string }>> {
  const appDir = getAppDir(id)
  try {
    const files: Array<{ path: string; content: string }> = []
    const entries = await fs.readdir(appDir, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(entry.parentPath, entry.name)
        const relPath = path.relative(appDir, fullPath)
        const content = await fs.readFile(fullPath, 'utf-8')
        files.push({ path: relPath, content })
      }
    }
    return files
  } catch {
    return []
  }
}
