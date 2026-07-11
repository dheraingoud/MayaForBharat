import { describe, it, expect } from 'vitest'
import SwitchableStream from '@/lib/workbench/llm/switchable-stream'

describe('SwitchableStream', () => {
  it('initializes correctly', () => {
    const stream = new SwitchableStream()
    expect(stream).toBeInstanceOf(TransformStream)
    expect(stream.switches).toBe(0)
    stream.close()
  })

  it('tracks switch count', async () => {
    const stream = new SwitchableStream()
    expect(stream.switches).toBe(0)

    // Switch to a simple readable stream
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue('test data')
        controller.close()
      },
    })
    
    await stream.switchSource(source)
    expect(stream.switches).toBe(1)

    // Wait a tick for pumping to finish
    await new Promise(r => setTimeout(r, 50))
    stream.close()
  })

  it('increments switch count on each source switch', async () => {
    const stream = new SwitchableStream()
    
    const makeSource = () => new ReadableStream({
      start(controller) {
        controller.enqueue('data')
        controller.close()
      },
    })

    await stream.switchSource(makeSource())
    expect(stream.switches).toBe(1)

    await stream.switchSource(makeSource())
    expect(stream.switches).toBe(2)

    // Wait for pumps
    await new Promise(r => setTimeout(r, 50))
    stream.close()
  })

  it('has readable and writable sides', () => {
    const stream = new SwitchableStream()
    expect(stream.readable).toBeDefined()
    expect(stream.writable).toBeDefined()
    stream.close()
  })

  it('close() stops the stream', () => {
    const stream = new SwitchableStream()
    // Should not throw
    stream.close()
    expect(stream.switches).toBe(0)
  })
})
