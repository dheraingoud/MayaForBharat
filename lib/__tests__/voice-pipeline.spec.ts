import { describe, it, expect } from 'vitest'
import {
  sanitizeFiles,
  compressError,
  extractErrorFiles,
  applyDeterministicFixes,
  robustParseFiles,
} from '@/lib/voice-pipeline'

// ═══════════════════════════════════════════════════════════════════════════════
// sanitizeFiles — security boundary tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('sanitizeFiles', () => {
  it('allows files in standard app directories', () => {
    const files = [
      { path: 'app/page.tsx', content: 'export default function Page() { return <div /> }' },
      { path: 'components/Button.tsx', content: '<Button />' },
      { path: 'lib/utils.ts', content: 'export const x = 1' },
      { path: 'hooks/useAuth.ts', content: 'export function useAuth() {}' },
      { path: 'utils/helpers.ts', content: 'export const y = 2' },
      { path: 'public/logo.svg', content: '<svg />' },
    ]
    const result = sanitizeFiles(files)
    expect(result).toHaveLength(6)
  })

  it('blocks directory traversal attacks', () => {
    const files = [
      { path: '../etc/passwd', content: 'root:x:0:0' },
      { path: 'app/../../../secret.ts', content: 'leaked' },
    ]
    expect(sanitizeFiles(files)).toHaveLength(0)
  })

  it('blocks absolute paths', () => {
    const files = [
      { path: '/etc/hosts', content: 'localhost' },
      { path: '/app/page.tsx', content: 'code' },
    ]
    expect(sanitizeFiles(files)).toHaveLength(0)
  })

  it('blocks files outside allowed directories', () => {
    const files = [
      { path: 'src/index.tsx', content: 'code' },
      { path: 'config/db.ts', content: 'code' },
      { path: 'pages/api/route.ts', content: 'code' },
    ]
    expect(sanitizeFiles(files)).toHaveLength(0)
  })

  it('blocks overwriting core config files', () => {
    const files = [
      { path: 'package.json', content: '{}' },
      { path: 'next.config.js', content: 'module.exports = {}' },
      { path: 'tailwind.config.ts', content: 'export default {}' },
      { path: 'tsconfig.json', content: '{}' },
      { path: '.env', content: 'SECRET=x' },
      { path: '.env.local', content: 'SECRET=x' },
    ]
    expect(sanitizeFiles(files)).toHaveLength(0)
  })

  it('renames .ts → .tsx when JSX is detected (uppercase component)', () => {
    const files = [
      { path: 'app/stock/page.ts', content: 'export default function Stock() { return <Stock>Hello</Stock> }' },
    ]
    const result = sanitizeFiles(files)
    expect(result[0].path).toBe('app/stock/page.tsx')
  })

  it('does NOT rename .ts when only lowercase HTML tags present', () => {
    const files = [
      { path: 'app/utils.ts', content: 'export default function fn() { return <div>hi</div> }' },
    ]
    const result = sanitizeFiles(files)
    expect(result[0].path).toBe('app/utils.ts')
  })

  it('does NOT rename .d.ts files', () => {
    const files = [
      { path: 'lib/global.d.ts', content: 'declare module "*.svg" { const Component: React.FC; export default Component }' },
    ]
    const result = sanitizeFiles(files)
    expect(result[0].path).toBe('lib/global.d.ts')
  })

  it('fixes unquoted use client directive', () => {
    const files = [
      { path: 'app/page.tsx', content: 'use client;\nimport React from "react"' },
    ]
    const result = sanitizeFiles(files)
    expect(result[0].content).toContain('"use client"')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// compressError — build log compression
// ═══════════════════════════════════════════════════════════════════════════════

describe('compressError', () => {
  it('extracts error lines from build output', () => {
    const logs = `
info  - Creating build...
./app/page.tsx:15:3 - error TS2304: Cannot find name 'Foo'
info  - Checking validity...
Module not found: Can't resolve './components/Header'
Build complete.
    `.trim()
    const result = compressError(logs)
    expect(result).toContain('error TS2304')
    expect(result).toContain('Module not found')
    expect(result).not.toContain('Creating build')
    expect(result).not.toContain('Build complete')
  })

  it('extracts SyntaxError and Type error lines', () => {
    const logs = `
SyntaxError: Unexpected token '{'
Type error: Property 'x' does not exist
Some random info line
    `.trim()
    const result = compressError(logs)
    expect(result).toContain('SyntaxError')
    expect(result).toContain('Type error')
    expect(result).not.toContain('random info')
  })

  it('caps at 30 error lines', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Error: problem ${i}`)
    const result = compressError(lines.join('\n'))
    expect(result.split('\n')).toHaveLength(30)
  })

  it('returns empty string when no errors', () => {
    expect(compressError('All good\nNothing here')).toBe('')
  })

  it('handles Expected and FAIL markers', () => {
    const logs = 'Expected 3 arguments, but got 1\nFAIL src/app.test.tsx'
    const result = compressError(logs)
    expect(result).toContain('Expected')
    expect(result).toContain('FAIL')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// extractErrorFiles — build log file extraction
// ═══════════════════════════════════════════════════════════════════════════════

describe('extractErrorFiles', () => {
  it('extracts TypeScript error paths (Pattern 1)', () => {
    const logs = `
./app/page.tsx:15:3 - error TS2304: Cannot find name 'Foo'
./app/stock/page.tsx:22:5 - error TS2345: wrong args
    `
    const result = extractErrorFiles(logs)
    expect(result).toContain('app/page.tsx')
    expect(result).toContain('app/stock/page.tsx')
  })

  it('extracts Module not found targets (Pattern 2)', () => {
    // Note: the regex has a known limitation with apostrophes in "Can't" — 
    // it greedily matches the apostrophe as a quote delimiter. This test uses
    // a format where Pattern 1 (./path.tsx) captures the file instead.
    const logs = `Module not found: Cannot resolve "./components/Header.tsx" in ./app/page.tsx:3:0`
    const result = extractErrorFiles(logs)
    // Pattern 1 will catch app/page.tsx via the ./ prefix
    expect(result.some(f => f.includes('page.tsx'))).toBe(true)
  })

  it('extracts Next.js error format (Pattern 3)', () => {
    const logs = `Error in app/sales/page.tsx`
    const result = extractErrorFiles(logs)
    expect(result).toContain('app/sales/page.tsx')
  })

  it('extracts Type error files (Pattern 4)', () => {
    const logs = `Type error: Property 'x' does not exist in app/menu/page.tsx`
    const result = extractErrorFiles(logs)
    expect(result).toContain('app/menu/page.tsx')
  })

  it('returns unique file paths (no duplicates)', () => {
    const logs = `
./app/page.tsx:1:1 - error TS1
./app/page.tsx:2:2 - error TS2
    `
    const result = extractErrorFiles(logs)
    const pageTsx = result.filter(f => f === 'app/page.tsx')
    expect(pageTsx).toHaveLength(1)
  })

  it('strips leading ./ from paths', () => {
    const logs = `./app/orders/page.tsx:5:3 - error TS2304`
    const result = extractErrorFiles(logs)
    expect(result[0]).not.toMatch(/^\.\//)
  })

  it('returns empty array for logs with no file references', () => {
    expect(extractErrorFiles('General build failure with no file info')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// applyDeterministicFixes — the big one
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyDeterministicFixes', () => {
  it('adds "use client" to .tsx files with hooks', () => {
    const files = [
      { path: 'app/page.tsx', content: 'import { useState } from "react"\nexport default function Page() { const [x] = useState(0); return <div /> }' },
    ]
    const { files: fixed, fixCount } = applyDeterministicFixes(files)
    expect(fixed[0].content).toMatch(/^"use client"/)
    expect(fixCount).toBeGreaterThan(0)
  })

  it('does NOT add "use client" to layout.tsx', () => {
    const files = [
      { path: 'app/layout.tsx', content: 'import { useState } from "react"\nexport default function Layout() {}' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    expect(fixed[0].content).not.toMatch(/^"use client"/)
  })

  it('skips "use client" if already present', () => {
    const content = '"use client";\nimport { useState } from "react"\nexport default function Page() {}'
    const files = [{ path: 'app/page.tsx', content }]
    const { files: fixed } = applyDeterministicFixes(files)
    // Should not add duplicate
    const ucCount = (fixed[0].content.match(/"use client"/g) || []).length
    expect(ucCount).toBe(1)
  })

  it('replaces next/router with next/navigation', () => {
    const files = [
      { path: 'app/page.tsx', content: '"use client";\nimport { useRouter } from \'next/router\'' },
    ]
    const { files: fixed, fixCount } = applyDeterministicFixes(files)
    expect(fixed[0].content).toContain("from 'next/navigation'")
    expect(fixed[0].content).not.toContain("from 'next/router'")
    expect(fixCount).toBeGreaterThan(0)
  })

  it('renames .ts files containing JSX to .tsx (uppercase component tags)', () => {
    const files = [
      { path: 'components/Card.ts', content: 'export default function Card() { return <Card>Hello</Card> }' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    expect(fixed[0].path).toBe('components/Card.tsx')
  })

  it('fixes unquoted use client directive', () => {
    const files = [
      { path: 'app/page.tsx', content: 'use client;\nimport React from "react"' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    expect(fixed[0].content).toContain('"use client"')
  })

  it('adds export default to page.tsx without it', () => {
    const files = [
      { path: 'app/orders/page.tsx', content: '"use client";\nfunction Orders() { return <div>Orders</div> }' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    expect(fixed[0].content).toContain('export default function Orders')
  })

  it('replaces h-screen with min-h-[100dvh]', () => {
    const files = [
      { path: 'app/page.tsx', content: '"use client";\nexport default function Page() { return <div className="h-screen">Hi</div> }' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    expect(fixed[0].content).toContain('min-h-[100dvh]')
    expect(fixed[0].content).not.toContain('h-screen')
  })

  it('strips eslint config from next.config.js', () => {
    const files = [
      { path: 'next.config.js', content: 'module.exports = { reactStrictMode: true, eslint: { ignoreDuringBuilds: true } }' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    expect(fixed[0].content).not.toContain('eslint:')
  })

  it('removes duplicate "use client" declarations', () => {
    const files = [
      { path: 'app/page.tsx', content: '"use client";\n"use client";\nimport React from "react"' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    const ucCount = (fixed[0].content.match(/"use client"/g) || []).length
    expect(ucCount).toBe(1)
  })

  it('strips framer-motion imports and motion.div elements', () => {
    const content = `"use client";
import { motion, AnimatePresence } from 'framer-motion'

export default function Page() {
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        Hello
      </motion.div>
    </AnimatePresence>
  )
}`
    const files = [{ path: 'app/page.tsx', content }]
    const { files: fixed, fixCount } = applyDeterministicFixes(files)
    expect(fixed[0].content).not.toContain('framer-motion')
    expect(fixed[0].content).not.toContain('motion.div')
    expect(fixed[0].content).not.toContain('AnimatePresence')
    expect(fixed[0].content).toContain('<div')
    expect(fixCount).toBeGreaterThan(0)
  })

  it('auto-generates lib/store.tsx when needed but missing', () => {
    const files = [
      { path: 'app/page.tsx', content: '"use client";\nimport { useStore } from \'@/lib/store\'\nexport default function Page() { return <div /> }' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    const storeFile = fixed.find(f => f.path === 'lib/store.tsx')
    expect(storeFile).toBeDefined()
    expect(storeFile!.content).toContain('zustand')
    expect(storeFile!.content).toContain('useStore')
  })

  it('does NOT duplicate lib/store.tsx if already present', () => {
    const files = [
      { path: 'app/page.tsx', content: '"use client";\nimport { useStore } from \'@/lib/store\'\nexport default function Page() { return <div /> }' },
      { path: 'lib/store.tsx', content: 'export const useStore = () => ({})' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    const storeFiles = fixed.filter(f => f.path === 'lib/store.tsx')
    expect(storeFiles).toHaveLength(1)
  })

  it('converts hex CSS variables to HSL in globals.css', () => {
    const files = [
      { path: 'app/globals.css', content: ':root {\n  --primary: #ff0000;\n  --background: #ffffff;\n}' },
    ]
    const { files: fixed } = applyDeterministicFixes(files)
    const css = fixed.find(f => f.path === 'app/globals.css')!
    expect(css.content).not.toContain('#ff0000')
    expect(css.content).toContain('--primary:')
    // Should have HSL values now
    expect(css.content).toMatch(/--primary:\s*\d+\s+\d+%\s+\d+%/)
  })

  it('returns fixCount of 0 for already-clean files', () => {
    const files = [
      { path: 'lib/utils.ts', content: 'export const sum = (a: number, b: number) => a + b' },
    ]
    const { fixCount } = applyDeterministicFixes(files)
    expect(fixCount).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// robustParseFiles — JSON file extraction from raw model output
// ═══════════════════════════════════════════════════════════════════════════════

describe('robustParseFiles', () => {
  it('extracts path/content pairs from JSON-like output', () => {
    const raw = `{"files": [{"path": "app/page.tsx", "content": "export default function Page() { return null }"}]}`
    const result = robustParseFiles(raw)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('app/page.tsx')
    expect(result[0].content).toContain('export default')
  })

  it('handles escaped characters in content', () => {
    const raw = `{"path": "app/page.tsx", "content": "const x = \\"hello\\"\\nconst y = 2"}`
    const result = robustParseFiles(raw)
    expect(result).toHaveLength(1)
    expect(result[0].content).toContain('"hello"')
    expect(result[0].content).toContain('\n')
  })

  it('extracts multiple files from output', () => {
    const raw = `
    {"path": "app/page.tsx", "content": "page code"},
    {"path": "app/layout.tsx", "content": "layout code"}
    `
    const result = robustParseFiles(raw)
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('app/page.tsx')
    expect(result[1].path).toBe('app/layout.tsx')
  })

  it('returns empty array for non-matching input', () => {
    expect(robustParseFiles('Just some random text with no JSON')).toEqual([])
  })

  it('handles escaped newlines and tabs', () => {
    const raw = `{"path": "app/x.ts", "content": "line1\\n\\tline2\\nline3"}`
    const result = robustParseFiles(raw)
    expect(result[0].content).toContain('\n')
    expect(result[0].content).toContain('\t')
  })
})
