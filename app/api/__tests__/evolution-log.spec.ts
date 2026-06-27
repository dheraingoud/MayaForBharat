import { describe, it, expect, vi } from 'vitest'

// Mock dependencies
vi.mock('@/lib/memory/autoDream', () => ({
  readEpisodes: vi.fn().mockResolvedValue([
    {
      date: '2026-06-20', cycleId: 'cycle-1',
      observed: ['checkout errors', 'slow page load'],
      proposed: 3, built: 2, merged: 1, rejected: 1,
      gateFailed: [{ gate: 'diff-size', count: 1 }],
      tokensUsed: 5000,
    },
  ]),
  readSemantic: vi.fn().mockResolvedValue([
    { id: 'f1', fact: 'Users mostly visit /checkout', confidence: 0.85, sourceEpisodes: ['cycle-1'], lastConfirmed: '2026-06-20' },
  ]),
}))
vi.mock('@/lib/store', () => ({
  getApp: vi.fn().mockResolvedValue({
    id: 'app-1', name: 'Test Shop', nameHindi: 'टेस्ट दुकान', category: 'kirana',
    url: 'https://test.vercel.app', status: 'live',
  }),
}))
vi.mock('@/lib/path', () => ({
  getBuildsDir: vi.fn((...sub: string[]) => `/mock/builds/${sub.join('/')}`),
}))

import { GET } from '@/app/api/evolution-log/route'
import { getApp } from '@/lib/store'

describe('GET /api/evolution-log', () => {
  it('returns 400 when appId is missing', async () => {
    const request = new Request('http://localhost/api/evolution-log')
    const response = await GET(request)
    expect(response.status).toBe(400)
  })

  it('returns 404 when app not found', async () => {
    vi.mocked(getApp).mockResolvedValueOnce(null)
    const request = new Request('http://localhost/api/evolution-log?appId=missing')
    const response = await GET(request)
    expect(response.status).toBe(404)
  })

  it('returns evolution entries and stats', async () => {
    const request = new Request('http://localhost/api/evolution-log?appId=app-1')
    const response = await GET(request)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.app.id).toBe('app-1')
    expect(body.app.name).toBe('Test Shop')
    expect(body.entries.length).toBeGreaterThanOrEqual(1)
    expect(body.stats.total).toBeGreaterThanOrEqual(1)
    expect(body.semanticFacts).toBe(1)
  })

  it('includes merged and discarded entries', async () => {
    const request = new Request('http://localhost/api/evolution-log?appId=app-1')
    const response = await GET(request)
    const body = await response.json()

    const merged = body.entries.filter((e: any) => e.status === 'merged')
    const discarded = body.entries.filter((e: any) => e.status === 'discarded')

    expect(merged.length).toBeGreaterThanOrEqual(1)
    expect(discarded.length).toBeGreaterThanOrEqual(1) // diff-size gate
    expect(body.stats.applied).toBe(merged.length)
    expect(body.stats.discarded).toBe(discarded.length)
  })
})
