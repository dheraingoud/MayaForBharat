import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { healthCheck, deleteVercelProject, deleteVercelDeployment } from '@/lib/deploy'

describe('healthCheck', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns passed for healthy page', async () => {
    const html = '<html><body>Hello world, this is a normal page</body></html>'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(html),
    })

    const result = await healthCheck('https://test.app')
    expect(result.passed).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.error).toBeUndefined()
  })

  it('fails for non-200 responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    })

    const result = await healthCheck('https://test.app')
    expect(result.passed).toBe(false)
    expect(result.statusCode).toBe(503)
    expect(result.error).toContain('503')
  })

  it('detects Application error marker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>Application error: something went wrong</html>'),
    })

    const result = await healthCheck('https://test.app')
    expect(result.passed).toBe(false)
    expect(result.statusCode).toBe(200)
    expect(result.error).toContain('Application error')
  })

  it('detects Internal Server Error marker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>Internal Server Error</html>'),
    })

    const result = await healthCheck('https://test.app')
    expect(result.passed).toBe(false)
    expect(result.error).toContain('Internal Server Error')
  })

  it('detects NEXT_NOT_FOUND marker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>NEXT_NOT_FOUND</html>'),
    })

    const result = await healthCheck('https://test.app')
    expect(result.passed).toBe(false)
  })

  it('detects MODULE_NOT_FOUND marker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>MODULE_NOT_FOUND</html>'),
    })

    const result = await healthCheck('https://test.app')
    expect(result.passed).toBe(false)
  })

  it('handles fetch timeout/error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('The operation was aborted'))

    const result = await healthCheck('https://unreachable.app')
    expect(result.passed).toBe(false)
    expect(result.statusCode).toBe(0)
    expect(result.error).toContain('aborted')
  })
})

describe('deleteVercelProject', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // Remove DEPLOY_TOKEN to test mock mode
    delete process.env.DEPLOY_TOKEN
  })

  it('returns true in mock mode (no token)', async () => {
    const result = await deleteVercelProject('proj-123')
    expect(result).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('deleteVercelDeployment', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    delete process.env.DEPLOY_TOKEN
  })

  it('returns true in mock mode (no token)', async () => {
    const result = await deleteVercelDeployment('https://test.vercel.app')
    expect(result).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
