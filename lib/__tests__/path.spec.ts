import { describe, it, expect } from 'vitest'
import { getBuildsDir } from '@/lib/path'
import path from 'path'
import os from 'os'

describe('getBuildsDir', () => {
  it('returns a path ending with .maya-builds', () => {
    const result = getBuildsDir()
    expect(result).toContain('.maya-builds')
  })

  it('appends subpaths', () => {
    const result = getBuildsDir('app-1', 'src')
    expect(result).toContain('app-1')
    expect(result).toContain('src')
    expect(result).toContain('.maya-builds')
  })

  it('uses tmpdir on Vercel, cwd otherwise', () => {
    const result = getBuildsDir()
    if (process.env.VERCEL) {
      expect(result.startsWith(os.tmpdir())).toBe(true)
    } else {
      expect(result.startsWith(process.cwd())).toBe(true)
    }
  })

  it('handles single subpath', () => {
    const result = getBuildsDir('my-app')
    const expected = path.join(process.cwd(), '.maya-builds', 'my-app')
    expect(result).toBe(expected)
  })

  it('handles no subpaths', () => {
    const result = getBuildsDir()
    const expected = path.join(process.cwd(), '.maya-builds')
    expect(result).toBe(expected)
  })
})
