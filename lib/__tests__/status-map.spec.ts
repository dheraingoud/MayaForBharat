import { describe, it, expect } from 'vitest'
import {
  detectLanguage,
  getStatusLine,
  inferStatusFromPath,
  stripThinking,
  shouldSummarize,
  buildSummaryPrompt,
  wrapXml,
  wrapFileXml,
  buildFileContext,
  wrapErrorXml,
  estimateTokens,
} from '@/lib/status-map'
import type { StatusEvent } from '@/lib/status-map'

// ─── detectLanguage ──────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it('detects English text', () => {
    expect(detectLanguage('I want a stock tracker for my shop')).toBe('en')
  })

  it('detects Hindi text', () => {
    expect(detectLanguage('मुझे अपनी दुकान के लिए स्टॉक ट्रैकर चाहिए')).toBe('hi')
  })

  it('detects mixed text as Hindi when Devanagari > 15%', () => {
    expect(detectLanguage('मेरी shop के लिए app बनाओ')).toBe('hi')
  })

  it('returns en for empty string', () => {
    expect(detectLanguage('')).toBe('en')
  })

  it('returns en for pure English with numbers', () => {
    expect(detectLanguage('Add 5 items to stock at Rs 100 each')).toBe('en')
  })
})

// ─── getStatusLine ───────────────────────────────────────────────────────────

describe('getStatusLine', () => {
  it('returns English status for known events', () => {
    expect(getStatusLine('planner_start', 'en')).toBe('Understanding your request...')
    expect(getStatusLine('done', 'en')).toBe('App is ready! 🎉')
    expect(getStatusLine('deploying', 'en')).toBe('Publishing update...')
  })

  it('returns Hindi status for known events', () => {
    expect(getStatusLine('planner_start', 'hi')).toBe('MAYA समझ रही है...')
    expect(getStatusLine('done', 'hi')).toBe('App ready है! 🎉')
  })

  it('auto-detects language from user message', () => {
    const enLine = getStatusLine('done', 'Build my app please')
    expect(enLine).toBe('App is ready! 🎉')

    const hiLine = getStatusLine('done', 'मेरी ऐप बनाओ')
    expect(hiLine).toBe('App ready है! 🎉')
  })

  it('defaults to English', () => {
    expect(getStatusLine('done')).toBe('App is ready! 🎉')
  })

  it('returns error line for unknown events', () => {
    const result = getStatusLine('unknown_event' as StatusEvent, 'en')
    expect(result).toBe('Something went wrong, please try again')
  })

  const ALL_EVENTS: StatusEvent[] = [
    'planner_start', 'reading_files', 'editing_code', 'writer_schema',
    'writer_page', 'writer_component', 'writer_api', 'build_check',
    'build_fail', 'build_retry', 'deploying', 'deploy_fail',
    'visual_check', 'visual_fail', 'self_correct', 'done', 'error',
  ]

  it('has status lines for all 17 events', () => {
    for (const event of ALL_EVENTS) {
      const en = getStatusLine(event, 'en')
      const hi = getStatusLine(event, 'hi')
      expect(en).toBeTruthy()
      expect(hi).toBeTruthy()
      expect(en).not.toBe(hi) // Should be different languages
    }
  })
})

// ─── inferStatusFromPath ─────────────────────────────────────────────────────

describe('inferStatusFromPath', () => {
  it('detects schema files', () => {
    expect(inferStatusFromPath('convex/schema.ts')).toBe('writer_schema')
    expect(inferStatusFromPath('convex/users.ts')).toBe('writer_schema')
  })

  it('detects page files', () => {
    expect(inferStatusFromPath('app/dashboard/page.tsx')).toBe('writer_page')
    expect(inferStatusFromPath('app/stock/page.jsx')).toBe('writer_page')
  })

  it('detects component files', () => {
    expect(inferStatusFromPath('components/StockCard.tsx')).toBe('writer_component')
    expect(inferStatusFromPath('app/components/Header.tsx')).toBe('writer_component')
  })

  it('detects API files', () => {
    expect(inferStatusFromPath('app/api/build/route.ts')).toBe('writer_api')
    expect(inferStatusFromPath('src/actions/deploy.ts')).toBe('writer_api')
    expect(inferStatusFromPath('src/mutations/update.ts')).toBe('writer_api')
  })

  it('convex/ paths are classified as schema (higher priority)', () => {
    // convex/ pattern matches before actions/mutations
    expect(inferStatusFromPath('convex/actions/deploy.ts')).toBe('writer_schema')
    expect(inferStatusFromPath('convex/mutations/update.ts')).toBe('writer_schema')
  })

  it('falls back to editing_code for other files', () => {
    expect(inferStatusFromPath('lib/utils.ts')).toBe('editing_code')
    expect(inferStatusFromPath('tailwind.config.js')).toBe('editing_code')
    expect(inferStatusFromPath('package.json')).toBe('editing_code')
  })
})

// ─── stripThinking ───────────────────────────────────────────────────────────

describe('stripThinking', () => {
  it('strips maya-thinking tags', () => {
    const content = 'Hello <maya-thinking>I need to plan this</maya-thinking> world'
    const result = stripThinking(content)
    expect(result.display).toBe('Hello  world')
    expect(result.thinking).toBe('I need to plan this')
  })

  it('handles multiple thinking blocks', () => {
    const content = '<maya-thinking>thought1</maya-thinking> text <maya-thinking>thought2</maya-thinking>'
    const result = stripThinking(content)
    expect(result.display).toBe('text')
    expect(result.thinking).toContain('thought1')
    expect(result.thinking).toContain('thought2')
  })

  it('handles no thinking tags', () => {
    const content = 'Just regular text without thinking'
    const result = stripThinking(content)
    expect(result.display).toBe('Just regular text without thinking')
    expect(result.thinking).toBe('')
  })

  it('handles empty content', () => {
    const result = stripThinking('')
    expect(result.display).toBe('')
    expect(result.thinking).toBe('')
  })
})

// ─── shouldSummarize ─────────────────────────────────────────────────────────

describe('shouldSummarize', () => {
  it('returns false for short conversations', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]
    expect(shouldSummarize(messages)).toBe(false)
  })

  it('returns true when conversation exceeds maxTurns', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }))
    expect(shouldSummarize(messages, 8)).toBe(true)
  })

  it('ignores system messages in count', () => {
    const messages = [
      { role: 'system', content: 'You are MAYA' },
      { role: 'system', content: 'Context' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]
    expect(shouldSummarize(messages, 8)).toBe(false)
  })

  it('uses default maxTurns of 8', () => {
    const messages = Array.from({ length: 9 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `M${i}`,
    }))
    expect(shouldSummarize(messages)).toBe(true)
  })
})

// ─── buildSummaryPrompt ──────────────────────────────────────────────────────

describe('buildSummaryPrompt', () => {
  it('includes SUMMARY_MODE instruction', () => {
    const prompt = buildSummaryPrompt([{ role: 'user', content: 'Hello' }])
    expect(prompt).toContain('SUMMARY_MODE')
  })

  it('includes conversation content', () => {
    const prompt = buildSummaryPrompt([
      { role: 'user', content: 'Build a stock app' },
      { role: 'assistant', content: 'I will build it' },
    ])
    expect(prompt).toContain('Build a stock app')
    expect(prompt).toContain('I will build it')
  })

  it('excludes system messages', () => {
    const prompt = buildSummaryPrompt([
      { role: 'system', content: 'SECRET INSTRUCTIONS' },
      { role: 'user', content: 'Hello' },
    ])
    expect(prompt).not.toContain('SECRET INSTRUCTIONS')
  })

  it('truncates long messages to 300 chars', () => {
    const longContent = 'A'.repeat(500)
    const prompt = buildSummaryPrompt([{ role: 'user', content: longContent }])
    // Should only include first 300 chars
    expect(prompt).not.toContain('A'.repeat(500))
  })

  it('includes required format sections', () => {
    const prompt = buildSummaryPrompt([{ role: 'user', content: 'Hi' }])
    expect(prompt).toContain('Files Discussed')
    expect(prompt).toContain('Project Context')
    expect(prompt).toContain('Implementation Details')
    expect(prompt).toContain('User Preferences')
    expect(prompt).toContain('Current Status')
  })
})

// ─── XML Utilities ───────────────────────────────────────────────────────────

describe('wrapXml', () => {
  it('wraps content in XML tags', () => {
    expect(wrapXml('name', 'MAYA')).toBe('<name>MAYA</name>')
  })

  it('handles empty content', () => {
    expect(wrapXml('tag', '')).toBe('<tag></tag>')
  })
})

describe('wrapFileXml', () => {
  it('wraps file with path and content', () => {
    const result = wrapFileXml('src/app.tsx', 'export default function App() {}')
    expect(result).toContain('<file>')
    expect(result).toContain('<path>src/app.tsx</path>')
    expect(result).toContain('<content>export default function App() {}</content>')
    expect(result).toContain('</file>')
  })

  it('adds truncation notice when truncated=true', () => {
    const result = wrapFileXml('src/big.ts', '', true)
    expect(result).toContain('Content truncated')
    expect(result).toContain('<notice>')
  })
})

describe('buildFileContext', () => {
  it('builds context from multiple files', () => {
    const files = [
      { path: 'a.ts', content: 'const a = 1' },
      { path: 'b.ts', content: 'const b = 2' },
    ]
    const result = buildFileContext(files)
    expect(result).toContain('a.ts')
    expect(result).toContain('b.ts')
    expect(result).toContain('const a = 1')
    expect(result).toContain('const b = 2')
  })

  it('truncates large file content', () => {
    const files = [{ path: 'big.ts', content: 'x'.repeat(10000) }]
    const result = buildFileContext(files, 100)
    // Content should be truncated to maxCharsPerFile
    expect(result).toContain('<content>' + 'x'.repeat(100) + '</content>')
  })
})

describe('wrapErrorXml', () => {
  it('wraps error with source attribute', () => {
    const result = wrapErrorXml('Cannot find module', 'build')
    expect(result).toBe('<error source="build">\nCannot find module\n</error>')
  })

  it('defaults to build source', () => {
    const result = wrapErrorXml('Error')
    expect(result).toContain('source="build"')
  })

  it('supports runtime and deploy sources', () => {
    expect(wrapErrorXml('err', 'runtime')).toContain('source="runtime"')
    expect(wrapErrorXml('err', 'deploy')).toContain('source="deploy"')
  })
})

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates ~4 chars per token for English', () => {
    const text = 'Hello world this is a test'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBe(Math.ceil(text.length / 4))
  })

  it('estimates ~2 chars per token for Hindi (Devanagari)', () => {
    const text = 'मेरी दुकान'
    const tokens = estimateTokens(text)
    // 10 Devanagari chars + 1 space = ceil(1/4 + 10/2) = ceil(5.25) = 6
    expect(tokens).toBeGreaterThan(0)
  })

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('handles mixed content', () => {
    const text = 'Build मेरी app'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
  })
})
