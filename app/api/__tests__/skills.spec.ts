import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the skills module
vi.mock('@/lib/skills', () => ({
  listSkills: vi.fn().mockResolvedValue([
    { name: 'caveman', description: 'Test skill', contexts: ['proposer'], cached: false, stale: true },
    { name: 'frontend-design', description: 'UI skill', contexts: ['builder'], cached: true, stale: false },
  ]),
  refreshSkill: vi.fn().mockResolvedValue({ success: true, chars: 500 }),
  getSkillsForContext: vi.fn().mockResolvedValue('\n\n# Loaded Skills\n--- SKILL: caveman ---\ntest\n--- END SKILL ---'),
}))

import { GET, POST } from '@/app/api/skills/route'

describe('GET /api/skills', () => {
  it('returns list of all skills', async () => {
    const request = new Request('http://localhost/api/skills')
    const response = await GET(request)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.skills).toBeDefined()
    expect(Array.isArray(body.skills)).toBe(true)
    expect(body.skills).toHaveLength(2)
  })

  it('returns skills for a specific context', async () => {
    const request = new Request('http://localhost/api/skills?context=builder')
    const response = await GET(request)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.context).toBe('builder')
    expect(body.skills).toBeDefined()
    expect(typeof body.chars).toBe('number')
  })
})

describe('POST /api/skills', () => {
  it('refreshes a skill by name', async () => {
    const request = new Request('http://localhost/api/skills', {
      method: 'POST',
      body: JSON.stringify({ name: 'caveman' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.chars).toBe(500)
  })

  it('returns 400 for missing skill name', async () => {
    const request = new Request('http://localhost/api/skills', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toContain('Missing')
  })
})
