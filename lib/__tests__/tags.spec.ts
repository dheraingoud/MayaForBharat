import { describe, it, expect } from 'vitest'
import { parseModelOutput, type FileOperation } from '../tags'

// ─── parseModelOutput ────────────────────────────────────────────────────────

describe('parseModelOutput', () => {
  it('parses maya-write tags', () => {
    const output = '<maya-write path="src/app.tsx">console.log("hello")</maya-write>'
    const ops = parseModelOutput(output)
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('write')
    expect(ops[0].path).toBe('src/app.tsx')
    expect(ops[0].content).toBe('console.log("hello")')
  })

  it('parses multiple maya-write tags', () => {
    const output = `
<maya-write path="src/a.ts">const a = 1</maya-write>
<maya-write path="src/b.ts">const b = 2</maya-write>
    `
    const ops = parseModelOutput(output)
    expect(ops).toHaveLength(2)
    expect(ops[0].path).toBe('src/a.ts')
    expect(ops[1].path).toBe('src/b.ts')
  })

  it('parses maya-delete tags', () => {
    const output = '<maya-delete path="src/old.ts" />'
    const ops = parseModelOutput(output)
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('delete')
    expect(ops[0].path).toBe('src/old.ts')
  })

  it('parses mixed write and delete operations', () => {
    const output = `
<maya-write path="src/new.ts">new content</maya-write>
<maya-delete path="src/old.ts" />
    `
    const ops = parseModelOutput(output)
    expect(ops).toHaveLength(2)
    expect(ops[0].type).toBe('write')
    expect(ops[1].type).toBe('delete')
  })

  it('returns empty array for no tags', () => {
    const output = 'Just some regular text with no tags'
    expect(parseModelOutput(output)).toEqual([])
  })

  it('handles multiline content in write tags', () => {
    const output = `<maya-write path="src/app.tsx">
import React from 'react'

export default function App() {
  return <div>Hello</div>
}
</maya-write>`
    const ops = parseModelOutput(output)
    expect(ops).toHaveLength(1)
    expect(ops[0].content).toContain('import React')
    expect(ops[0].content).toContain('export default')
  })

  it('handles single-quoted paths', () => {
    const output = "<maya-write path='src/app.tsx'>content</maya-write>"
    const ops = parseModelOutput(output)
    expect(ops).toHaveLength(1)
    expect(ops[0].path).toBe('src/app.tsx')
  })

  it('handles nested directory paths', () => {
    const output = '<maya-write path="src/components/ui/Button.tsx">button</maya-write>'
    const ops = parseModelOutput(output)
    expect(ops[0].path).toBe('src/components/ui/Button.tsx')
  })

  it('FileOperation type shape is correct', () => {
    const op: FileOperation = { type: 'write', path: 'test.ts', content: 'hello' }
    expect(op.type).toBe('write')
    expect(op.path).toBe('test.ts')
    expect(op.content).toBe('hello')

    const del: FileOperation = { type: 'delete', path: 'old.ts' }
    expect(del.type).toBe('delete')
    expect(del.content).toBeUndefined()
  })
})
