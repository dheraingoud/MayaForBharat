/**
 * MAYA App Store — Simple JSON persistence for built app metadata.
 * No DB needed for prototype. Apps saved as JSON metadata + file tree.
 */

import { promises as fs } from 'fs'
import path from 'path'
import { getBuildsDir } from '@/lib/path'
import { ConvexHttpClient } from "convex/browser"
import { api } from "@/convex/_generated/api"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || "https://example.check.convex.cloud"
const convex = new ConvexHttpClient(convexUrl)

export interface AppMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

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
  messages?: AppMessage[]
  files: Array<{ path: string; content: string }>
}

function getAppDir(id: string): string {
  return getBuildsDir(id)
}

function mapFromConvex(doc: any): BuiltApp {
  return {
    id: doc.appId || doc._id,
    name: doc.name,
    nameHindi: doc.nameHindi || doc.name,
    descriptionEn: doc.descriptionEn || doc.descriptionHindi || '',
    category: doc.category || doc.templateFamily || 'other',
    url: doc.vercelUrl || '',
    projectId: doc.vercelProjectId || '',
    createdAt: new Date(doc.createdAt).toISOString(),
    status: doc.status as 'live' | 'building',
    adminUsername: doc.adminUsername,
    adminPin: doc.adminPin,
    shownToOwner: doc.shownToOwner,
    messages: doc.messages || [],
    files: [],
  }
}

export async function readStore(): Promise<BuiltApp[]> {
  try {
    const docs = await convex.query(api.apps.listAll)
    return docs.map(mapFromConvex)
  } catch (e) {
    console.error("Error reading store from Convex:", e)
    return []
  }
}

export async function addApp(app: BuiltApp): Promise<void> {
  try {
    await convex.mutation(api.apps.create, {
      traderId: "anonymous", // we don't have auth context here, could be passed later
      appId: app.id,
      name: app.name,
      nameHindi: app.nameHindi,
      descriptionEn: app.descriptionEn,
      category: app.category,
      vercelUrl: app.url,
      vercelProjectId: app.projectId,
      adminUsername: app.adminUsername,
      adminPin: app.adminPin,
      shownToOwner: app.shownToOwner,
      status: app.status,
    })
  } catch (e) {
    console.error("Error adding app to Convex:", e)
  }
}

export async function getApp(id: string): Promise<BuiltApp | null> {
  try {
    const doc = await convex.query(api.apps.getByAppId, { appId: id })
    if (!doc) return null
    return mapFromConvex(doc)
  } catch (e) {
    console.error("Error getting app from Convex:", e)
    return null
  }
}

export async function removeApp(id: string): Promise<void> {
  try {
    await convex.mutation(api.apps.removeByAppId, { appId: id })
  } catch (e) {
    console.error("Error removing app from Convex:", e)
  }
}

export async function updateAppMessages(id: string, messages: AppMessage[]): Promise<void> {
  try {
    const doc = await convex.query(api.apps.getByAppId, { appId: id })
    if (doc) {
      await convex.mutation(api.apps.update, { id: doc._id, messages })
    }
  } catch (e) {
    console.error("Error updating app messages in Convex:", e)
  }
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
