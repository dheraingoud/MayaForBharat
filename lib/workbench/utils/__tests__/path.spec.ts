import { describe, it, expect } from 'vitest'
import { path, computeRelativePathOfFile } from '../path'

// ─── path (browser-compatible) ──────────────────────────────────────────────

describe('path', () => {
  it('joins paths', () => {
    expect(path.join('/home', 'project', 'src')).toBe('/home/project/src')
    expect(path.join('a', 'b', 'c')).toBe('a/b/c')
  })

  it('handles double slashes in join', () => {
    expect(path.join('/home/', '/project')).toBe('/home/project')
  })

  it('gets dirname', () => {
    expect(path.dirname('/home/project/src/app.ts')).toBe('/home/project/src')
    expect(path.dirname('/home/project/file.txt')).toBe('/home/project')
  })

  it('gets basename', () => {
    expect(path.basename('/home/project/app.ts')).toBe('app.ts')
    expect(path.basename('/home/project/app.ts', '.ts')).toBe('app')
  })

  it('gets extname', () => {
    expect(path.extname('app.ts')).toBe('.ts')
    expect(path.extname('file.test.tsx')).toBe('.tsx')
    expect(path.extname('noext')).toBe('')
  })

  it('computes relative path', () => {
    expect(path.relative('/home/project', '/home/project/src/app.ts')).toBe('src/app.ts')
  })

  it('checks absolute paths', () => {
    expect(path.isAbsolute('/home/project')).toBe(true)
    expect(path.isAbsolute('relative/path')).toBe(false)
  })

  it('normalizes paths', () => {
    expect(path.normalize('/home/project/../other')).toBe('/home/other')
    expect(path.normalize('/home/./project')).toBe('/home/project')
  })

  it('parses paths', () => {
    const parsed = path.parse('/home/project/app.ts')
    expect(parsed.root).toBe('/')
    expect(parsed.dir).toBe('/home/project')
    expect(parsed.base).toBe('app.ts')
    expect(parsed.ext).toBe('.ts')
    expect(parsed.name).toBe('app')
  })

  it('formats path objects', () => {
    const result = path.format({ root: '/', dir: '/home/project', base: 'app.ts', ext: '.ts', name: 'app' })
    expect(result).toBe('/home/project/app.ts')
  })
})

// ─── computeRelativePathOfFile ──────────────────────────────────────────────

describe('computeRelativePathOfFile', () => {
  it('strips default base path', () => {
    expect(computeRelativePathOfFile('/home/project/src/app.ts')).toBe('/src/app.ts')
  })

  it('strips custom base path', () => {
    expect(computeRelativePathOfFile('/custom/base/file.ts', '/custom/base')).toBe('/file.ts')
  })

  it('returns full path when base does not match', () => {
    expect(computeRelativePathOfFile('/other/path/file.ts')).toBe('/other/path/file.ts')
  })

  it('handles path equal to base', () => {
    expect(computeRelativePathOfFile('/home/project', '/home/project')).toBe('')
  })
})
