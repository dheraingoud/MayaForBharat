import { describe, it, expect } from 'vitest'
import { withResolvers } from '../promises'

describe('withResolvers', () => {
  it('returns promise, resolve, and reject', () => {
    const result = withResolvers<string>()
    expect(result.promise).toBeInstanceOf(Promise)
    expect(typeof result.resolve).toBe('function')
    expect(typeof result.reject).toBe('function')
  })

  it('resolves with value', async () => {
    const { promise, resolve } = withResolvers<number>()
    resolve(42)
    const value = await promise
    expect(value).toBe(42)
  })

  it('rejects with error', async () => {
    const { promise, reject } = withResolvers<string>()
    reject(new Error('test error'))
    await expect(promise).rejects.toThrow('test error')
  })

  it('can be awaited before resolving', async () => {
    const { promise, resolve } = withResolvers<string>()
    let resolved = false
    promise.then(() => { resolved = true })
    expect(resolved).toBe(false)
    resolve('done')
    await promise
    expect(resolved).toBe(true)
  })
})
