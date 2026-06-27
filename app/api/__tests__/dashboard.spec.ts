import { describe, it, expect, vi } from 'vitest'

// Mock dependencies
vi.mock('@/lib/store', () => ({
  readStore: vi.fn().mockResolvedValue([
    {
      id: 'app-1', name: 'Chai Corner', nameHindi: 'चाय कॉर्नर',
      descriptionEn: 'Tea shop', category: 'restaurant',
      url: 'https://chai.vercel.app', projectId: 'proj-1',
      createdAt: '2026-06-01', status: 'live',
      messages: [{ role: 'user', content: 'hello', timestamp: 1 }],
    },
    {
      id: 'app-2', name: 'Kiran Store', nameHindi: 'किरण स्टोर',
      descriptionEn: 'General store', category: 'kirana',
      url: 'https://kiran.vercel.app', projectId: 'proj-2',
      createdAt: '2026-06-10', status: 'building',
      messages: [],
    },
  ]),
}))
vi.mock('@/lib/memory/autoDream', () => ({
  readEpisodes: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/path', () => ({
  getBuildsDir: vi.fn((...sub: string[]) => `/mock/builds/${sub.join('/')}`),
}))

import { GET } from '@/app/api/dashboard/route'

describe('GET /api/dashboard', () => {
  it('returns all apps with enriched data', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.apps).toHaveLength(2)
  })

  it('includes category emoji', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body.apps[0].emoji).toBe('🍽️') // restaurant
    expect(body.apps[1].emoji).toBe('🛒') // kirana
  })

  it('includes app metadata', async () => {
    const response = await GET()
    const body = await response.json()
    const app = body.apps[0]
    expect(app.id).toBe('app-1')
    expect(app.nameKey).toBe('Chai Corner')
    expect(app.nameHindi).toBe('चाय कॉर्नर')
    expect(app.status).toBe('live')
    expect(app.url).toBe('https://chai.vercel.app')
    expect(app.messages).toHaveLength(1)
  })

  it('defaults updates to 0 when no episodes', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body.apps[0].updates).toBe(0)
    expect(body.apps[1].updates).toBe(0)
  })

  it('defaults hasImprovements to false', async () => {
    const response = await GET()
    const body = await response.json()
    expect(body.apps[0].hasImprovements).toBe(false)
    expect(body.apps[1].hasImprovements).toBe(false)
  })
})
