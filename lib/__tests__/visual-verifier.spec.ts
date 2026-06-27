import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the nim-client module to prevent actual API calls
vi.mock('@/lib/nim-client', () => ({
  nimVision: vi.fn(),
  MODELS: {
    VERIFIER: { id: 'test-verifier-model' },
    MAX: { id: 'test-max-model' },
  },
}))

// Mock global fetch for quickVerify and verifyFromContent
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { quickVerify } from '@/lib/visual-verifier'

describe('quickVerify', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns healthy for a valid page', async () => {
    const htmlContent = '<html><head></head><body>' + 'x'.repeat(300) + '</body></html>'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(htmlContent),
    })

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.contentLength).toBe(htmlContent.length)
    expect(result.errors).toHaveLength(0)
  })

  it('returns unhealthy for non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(false)
    expect(result.statusCode).toBe(500)
    expect(result.errors).toContain('HTTP 500')
  })

  it('detects Application error marker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('x'.repeat(300) + 'Application error: a client-side exception'),
    })

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(false)
    expect(result.errors).toContain('Application error')
  })

  it('detects Internal Server Error marker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('x'.repeat(300) + 'Internal Server Error'),
    })

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(false)
    expect(result.errors).toContain('Internal Server Error')
  })

  it('detects MODULE_NOT_FOUND marker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('x'.repeat(300) + 'MODULE_NOT_FOUND'),
    })

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(false)
    expect(result.errors).toContain('MODULE_NOT_FOUND')
  })

  it('detects suspiciously short content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>short</html>'),
    })

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(false)
    expect(result.errors).toContain('Page content suspiciously short')
  })

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

    const result = await quickVerify('https://unreachable.app')
    expect(result.healthy).toBe(false)
    expect(result.statusCode).toBe(0)
    expect(result.contentLength).toBe(0)
    expect(result.errors).toContain('Network timeout')
  })

  it('handles non-Error exceptions', async () => {
    mockFetch.mockRejectedValueOnce('unknown error string')

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(false)
    expect(result.errors[0]).toBe('unknown error string')
  })

  it('detects multiple error markers at once', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve('x'.repeat(300) + 'Application error and Internal Server Error found'),
    })

    const result = await quickVerify('https://test.app')
    expect(result.healthy).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})
