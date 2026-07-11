import { describe, it, expect } from 'vitest'
import { formatSize } from '../formatSize'

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(0)).toBe('0.0 B')
    expect(formatSize(100)).toBe('100.0 B')
    expect(formatSize(1023)).toBe('1023.0 B')
  })

  it('formats kilobytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(10240)).toBe('10.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(1024 * 1024 * 5.5)).toBe('5.5 MB')
  })

  it('formats gigabytes', () => {
    expect(formatSize(1024 ** 3)).toBe('1.0 GB')
    expect(formatSize(1024 ** 3 * 2.7)).toBe('2.7 GB')
  })

  it('formats terabytes', () => {
    expect(formatSize(1024 ** 4)).toBe('1.0 TB')
  })

  it('caps at TB for very large values', () => {
    expect(formatSize(1024 ** 5)).toBe('1024.0 TB')
  })

  it('handles decimal precision', () => {
    expect(formatSize(1500)).toBe('1.5 KB')
    expect(formatSize(1600)).toBe('1.6 KB')
  })
})
