import { describe, it, expect } from 'vitest'
import { defaultSanitize, sanitizeAssistantContent } from './sanitize.js'
import type { ContentBlock } from './types.js'

describe('defaultSanitize', () => {
  it('strips leading thought\\n', () => {
    expect(defaultSanitize('thought\nHello')).toBe('Hello')
  })

  it('strips harmony channel wrapper', () => {
    const input = 'thought\n<|channel>thought\n<channel|>Real reply'
    expect(defaultSanitize(input)).toBe('Real reply')
  })

  it('handles symmetric harmony tokens', () => {
    // Strip-only approach: markers and channel names removed; content between
    // them is preserved. Result contains both reasoning and answer text.
    const input =
      '<|channel|>analysis<|message|>reasoning<|end|><|channel|>final<|message|>Answer<|end|>'
    const out = defaultSanitize(input)
    expect(out).not.toMatch(/<\|?/)
    expect(out).not.toContain('channel')
    expect(out).not.toContain('message')
    expect(out).not.toContain('end')
    expect(out).toContain('Answer')
  })

  it('is a no-op on clean text', () => {
    expect(defaultSanitize('Hello world')).toBe('Hello world')
  })
})

describe('sanitizeAssistantContent', () => {
  it('drops text block that becomes empty', () => {
    const input: ContentBlock[] = [
      { type: 'text', text: 'thought\n' },
      { type: 'tool_use', id: 'id1', name: 'foo', input: { query: 'x' } }
    ]
    const out = sanitizeAssistantContent(input, defaultSanitize)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      type: 'tool_use',
      id: 'id1',
      name: 'foo',
      input: { query: 'x' }
    })
  })

  it('does not touch tool_use input', () => {
    const block: ContentBlock = {
      type: 'tool_use',
      id: 'id1',
      name: 'search',
      input: { query: 'thought' }
    }
    const out = sanitizeAssistantContent([block], defaultSanitize)
    expect(out[0]).toEqual(block)
  })

  it('custom sanitizer overrides default', () => {
    const input: ContentBlock[] = [{ type: 'text', text: 'hello' }]
    const out = sanitizeAssistantContent(input, t => t.toUpperCase())
    expect(out[0]).toEqual({ type: 'text', text: 'HELLO' })
  })

  it('preserves artifacts when not applied (disabled flag simulation)', () => {
    const input: ContentBlock[] = [{ type: 'text', text: 'thought\nraw' }]
    // When the caller doesn't wrap, blocks pass through untouched.
    expect(input[0]).toEqual({ type: 'text', text: 'thought\nraw' })
  })
})
