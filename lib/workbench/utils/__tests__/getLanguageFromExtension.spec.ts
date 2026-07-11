import { describe, it, expect } from 'vitest'
import { getLanguageFromExtension } from '../getLanguageFromExtension'

describe('getLanguageFromExtension', () => {
  it('maps js to javascript', () => {
    expect(getLanguageFromExtension('js')).toBe('javascript')
  })

  it('maps jsx to jsx', () => {
    expect(getLanguageFromExtension('jsx')).toBe('jsx')
  })

  it('maps ts to typescript', () => {
    expect(getLanguageFromExtension('ts')).toBe('typescript')
  })

  it('maps tsx to tsx', () => {
    expect(getLanguageFromExtension('tsx')).toBe('tsx')
  })

  it('maps json to json', () => {
    expect(getLanguageFromExtension('json')).toBe('json')
  })

  it('maps html to html', () => {
    expect(getLanguageFromExtension('html')).toBe('html')
  })

  it('maps css to css', () => {
    expect(getLanguageFromExtension('css')).toBe('css')
  })

  it('maps py to python', () => {
    expect(getLanguageFromExtension('py')).toBe('python')
  })

  it('maps java to java', () => {
    expect(getLanguageFromExtension('java')).toBe('java')
  })

  it('maps rb to ruby', () => {
    expect(getLanguageFromExtension('rb')).toBe('ruby')
  })

  it('maps go to go', () => {
    expect(getLanguageFromExtension('go')).toBe('go')
  })

  it('maps rs to rust', () => {
    expect(getLanguageFromExtension('rs')).toBe('rust')
  })

  it('maps php to php', () => {
    expect(getLanguageFromExtension('php')).toBe('php')
  })

  it('maps swift to swift', () => {
    expect(getLanguageFromExtension('swift')).toBe('swift')
  })

  it('maps md to plaintext', () => {
    expect(getLanguageFromExtension('md')).toBe('plaintext')
  })

  it('maps sh to bash', () => {
    expect(getLanguageFromExtension('sh')).toBe('bash')
  })

  it('maps cpp to cpp', () => {
    expect(getLanguageFromExtension('cpp')).toBe('cpp')
  })

  it('maps c to c', () => {
    expect(getLanguageFromExtension('c')).toBe('c')
  })

  it('maps cs to csharp', () => {
    expect(getLanguageFromExtension('cs')).toBe('csharp')
  })

  it('defaults to typescript for unknown extensions', () => {
    expect(getLanguageFromExtension('xyz')).toBe('typescript')
    expect(getLanguageFromExtension('unknown')).toBe('typescript')
    expect(getLanguageFromExtension('')).toBe('typescript')
  })
})
