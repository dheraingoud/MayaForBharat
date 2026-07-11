import { describe, it, expect } from 'vitest'
import { isValidUrl, isAllowedUrl } from '@/lib/workbench/utils/url'

describe('isValidUrl', () => {
  it('accepts valid http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true)
    expect(isValidUrl('http://example.com/path?q=1')).toBe(true)
  })

  it('accepts valid https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('https://api.maya.dev/v1/apps')).toBe(true)
  })

  it('rejects non-http protocols', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false)
    expect(isValidUrl('file:///etc/passwd')).toBe(false)
    expect(isValidUrl('data:text/html,<h1>hello</h1>')).toBe(false)
  })

  it('rejects non-URLs', () => {
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('not a url')).toBe(false)
    expect(isValidUrl('example.com')).toBe(false)
  })
})

describe('isAllowedUrl (SSRF protection)', () => {
  it('allows public URLs', () => {
    expect(isAllowedUrl('https://api.vercel.app/deploy')).toBe(true)
    expect(isAllowedUrl('https://example.com')).toBe(true)
    expect(isAllowedUrl('https://8.8.8.8/dns')).toBe(true)
  })

  it('blocks localhost', () => {
    expect(isAllowedUrl('http://localhost')).toBe(false)
    expect(isAllowedUrl('http://localhost:3000')).toBe(false)
    expect(isAllowedUrl('http://localhost/admin')).toBe(false)
  })

  it('blocks IPv6 loopback', () => {
    expect(isAllowedUrl('http://[::1]')).toBe(false)
    expect(isAllowedUrl('http://[::1]:8080')).toBe(false)
  })

  it('blocks 0.0.0.0', () => {
    expect(isAllowedUrl('http://0.0.0.0')).toBe(false)
    expect(isAllowedUrl('http://0.0.0.0:9090')).toBe(false)
  })

  it('blocks 127.x.x.x loopback IPs', () => {
    expect(isAllowedUrl('http://127.0.0.1')).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:8080')).toBe(false)
    expect(isAllowedUrl('http://127.1.2.3')).toBe(false)
  })

  it('blocks 10.x.x.x private IPs', () => {
    expect(isAllowedUrl('http://10.0.0.1')).toBe(false)
    expect(isAllowedUrl('http://10.255.255.255')).toBe(false)
  })

  it('blocks 172.16-31.x.x private IPs', () => {
    expect(isAllowedUrl('http://172.16.0.1')).toBe(false)
    expect(isAllowedUrl('http://172.31.255.255')).toBe(false)
  })

  it('allows 172.32.x.x (not private)', () => {
    expect(isAllowedUrl('http://172.32.0.1')).toBe(true)
  })

  it('blocks 192.168.x.x private IPs', () => {
    expect(isAllowedUrl('http://192.168.0.1')).toBe(false)
    expect(isAllowedUrl('http://192.168.1.100')).toBe(false)
  })

  it('blocks 169.254.x.x link-local IPs', () => {
    expect(isAllowedUrl('http://169.254.169.254')).toBe(false) // AWS metadata
    expect(isAllowedUrl('http://169.254.0.1')).toBe(false)
  })

  it('rejects invalid URLs', () => {
    expect(isAllowedUrl('not-a-url')).toBe(false)
    expect(isAllowedUrl('')).toBe(false)
  })
})
