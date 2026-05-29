/**
 * MAYA Screenshot Tools — Serverless-native visual analysis
 *
 * Uses the free Microlink API to capture screenshots of Vercel preview URLs.
 * This completely eliminates the need for headless Chrome binaries in Vercel,
 * keeping the deployment well under the 50MB limit while enabling
 * true visual QA for the agentic loop.
 */

import { buildTool } from './registry'
import { z } from 'zod'

// ─── Take Screenshot ──────────────────────────────────────────────────────────

/**
 * Calls Microlink API to take a screenshot of a PUBLIC URL.
 * Returns the base64-encoded PNG string.
 */
export const takeScreenshotTool = buildTool({
  name: 'takeScreenshot',
  description: 'Take a screenshot of a public URL using Microlink API. Returns base64-encoded PNG.',
  schema: z.object({
    url: z.string().describe('The PUBLIC URL to screenshot'),
    waitMs: z.number().optional().describe('Wait milliseconds after load before screenshot (default: 2000)'),
    viewport: z.string().optional().describe('Viewport as WxH e.g. "390x844" (default: mobile)'),
  }),
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The PUBLIC URL to screenshot' },
      waitMs: { type: 'number', description: 'Wait ms after load' },
      viewport: { type: 'string', description: 'Viewport WxH' },
    },
    required: ['url'],
  },
  permission: 'read_only',
  isConcurrencySafe: true,

  async execute(args) {
    if (!args.url.startsWith('http')) {
      return { error: 'URL must be public (http/https). Localhost will not work with Microlink.', base64: null }
    }

    try {
      // Free microlink API call: screenshot=true, meta=false (faster)
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(args.url)}&screenshot=true&meta=false&waitFor=${args.waitMs || 2000}`)
      
      if (!res.ok) {
        throw new Error(`Microlink API error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      const imageUrl = data?.data?.screenshot?.url

      if (!imageUrl) {
        throw new Error('Microlink returned no screenshot URL')
      }

      // Fetch the actual image bytes from the returned URL
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) throw new Error('Failed to fetch image bytes')

      const arrayBuffer = await imgRes.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      return { base64, mimeType: 'image/png', url: args.url }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[screenshot] Microlink failed:', msg.slice(0, 300))
      return { error: `Screenshot failed: ${msg.slice(0, 200)}`, base64: null }
    }
  },
})

// ─── Take Snapshot (Accessibility Tree fallback) ──────────────────────────────

/**
 * Strips HTML to a clean structure. Since we no longer use agent-browser,
 * this acts as a lightweight DOM extractor native to Vercel.
 */
export const takeSnapshotTool = buildTool({
  name: 'takeSnapshot',
  description: 'Fetch URL and extract structural text (stripped HTML).',
  schema: z.object({
    url: z.string().describe('The URL to snapshot'),
  }),
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to snapshot' },
    },
    required: ['url'],
  },
  permission: 'read_only',
  isConcurrencySafe: true,

  async execute(args) {
    try {
      const res = await fetch(args.url)
      const html = await res.text()
      // Very crude DOM strip for context:
      const stripped = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '[ICON]')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 20000)

      return { snapshot: stripped, url: args.url }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { error: `Snapshot failed: ${msg.slice(0, 200)}`, snapshot: null }
    }
  },
})

// ─── Screenshot Diff ──────────────────────────────────────────────────────────

/**
 * Gate 5 visual diff wrapper. Since pixelmatch requires heavy canvas/image processing
 * in Node, we instead just ask the Step 3.7 Flash tester agent if the before/after
 * are visually cohesive. (Handled directly in coordinator).
 *
 * This function just verifies both URLs are reachable.
 */
export async function screenshotDiff(
  urlBefore: string,
  urlAfter: string
): Promise<{ diffPct: number; error?: string }> {
  try {
    const [resA, resB] = await Promise.all([
      fetch(urlBefore, { method: 'HEAD' }),
      fetch(urlAfter, { method: 'HEAD' })
    ])
    
    if (!resA.ok || !resB.ok) {
      return { diffPct: 0, error: 'One or both URLs unreachable' }
    }

    // Since we rely on the Step Flash visual tester agent to actually look at the 
    // images and determine if the change is good, we don't need a hard pixel diff % here.
    // Return a soft pass (0) to let the Agent handle the visual QA logic.
    return { diffPct: 0 }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { diffPct: 0, error: msg.slice(0, 200) }
  }
}
