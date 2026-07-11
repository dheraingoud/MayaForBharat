import { describe, it, expect } from 'vitest'
import { GET, HEAD } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
    expect(typeof body.timestamp).toBe('number')
  })

  it('returns a timestamp close to now', async () => {
    const before = Date.now()
    const response = await GET()
    const after = Date.now()
    const body = await response.json()
    expect(body.timestamp).toBeGreaterThanOrEqual(before)
    expect(body.timestamp).toBeLessThanOrEqual(after)
  })
})

describe('HEAD /api/health', () => {
  it('returns 200 with empty body', async () => {
    const response = await HEAD()
    expect(response.status).toBe(200)
    // HEAD responses have no body
    const body = await response.text()
    expect(body).toBe('')
  })
})
