import { describe, it, expect } from 'vitest'
import { defaultSanitize } from './sanitize.js'

describe('defaultSanitize', () => {
  it('strips leading thought\\n', () => {
    expect(defaultSanitize('thought\nHello')).toBe('Hello')
  })

  it('strips harmony channel wrapper', () => {
    const input = 'thought\n<|channel>thought\n<channel|>Real reply'
    expect(defaultSanitize(input)).toBe('Real reply')
  })

  it('handles symmetric harmony tokens', () => {
    const input =
      '<|channel|>analysis<|message|>reasoning<|end|><|channel|>final<|message|>Answer<|end|>'
    const out = defaultSanitize(input)
    expect(out).not.toMatch(/<\|?/)
    expect(out).not.toContain('channel')
    expect(out).not.toContain('message')
    expect(out).not.toContain('end')
    expect(out).toContain('Answer')
  })

  it('strips bare channel marker with no header', () => {
    expect(defaultSanitize('<channel|>Привет!')).toBe('Привет!')
  })

  it('is a no-op on clean text', () => {
    expect(defaultSanitize('Hello world')).toBe('Hello world')
  })

  it('returns empty string when the entire text is an artifact', () => {
    expect(defaultSanitize('thought\n')).toBe('')
  })
})
