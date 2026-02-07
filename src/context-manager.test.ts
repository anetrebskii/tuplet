import { describe, it, expect } from 'vitest'
import { truncateOldMessages, estimateMessageTokens, ContextManager } from './context-manager.js'
import type { Message } from './types.js'

// Helpers to build messages concisely
function userText(text: string): Message {
  return { role: 'user', content: text }
}

function assistantText(text: string): Message {
  return { role: 'assistant', content: text }
}

function assistantToolUse(id: string, name: string = '__shell__'): Message {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', id, name, input: {} }],
  }
}

function userToolResult(toolUseId: string, result: string = 'ok'): Message {
  return {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseId, content: result }],
  }
}

function assistantTextAndToolUse(text: string, id: string, name: string = '__shell__'): Message {
  return {
    role: 'assistant',
    content: [
      { type: 'text', text },
      { type: 'tool_use', id, name, input: {} },
    ],
  }
}

describe('truncateOldMessages', () => {
  it('returns all messages when within limit', () => {
    const messages: Message[] = [
      userText('hello'),
      assistantText('hi'),
    ]
    const result = truncateOldMessages(messages, 100000)
    expect(result).toEqual(messages)
  })

  it('preserves first message and keeps recent messages', () => {
    const messages: Message[] = [
      userText('first'),
      assistantText('a'.repeat(1000)),
      userText('b'.repeat(1000)),
      assistantText('c'.repeat(100)),
      userText('last'),
    ]
    const firstTokens = estimateMessageTokens(messages[0])
    const lastTwoTokens = estimateMessageTokens(messages[3]) + estimateMessageTokens(messages[4])
    const limit = firstTokens + lastTwoTokens + 10 // just enough for first + last two

    const result = truncateOldMessages(messages, limit)
    expect(result[0]).toEqual(messages[0]) // first preserved
    expect(result[result.length - 1]).toEqual(messages[4]) // last preserved
    expect(result.length).toBeLessThan(messages.length)
  })

  describe('tool_use/tool_result pair safety', () => {
    it('never separates a tool_use from its tool_result', () => {
      const messages: Message[] = [
        userText('start'),                              // [0] preserved
        assistantToolUse('tool_1'),                     // [1] pair A
        userToolResult('tool_1', 'x'.repeat(2000)),     // [2] pair A
        assistantToolUse('tool_2'),                     // [3] pair B
        userToolResult('tool_2', 'y'.repeat(2000)),     // [4] pair B
        assistantText('final answer'),                  // [5]
        userText('thanks'),                             // [6]
      ]

      // Set limit so that only some messages fit after first
      const firstTokens = estimateMessageTokens(messages[0])
      const lastTwoTokens = estimateMessageTokens(messages[5]) + estimateMessageTokens(messages[6])
      const pairBTokens = estimateMessageTokens(messages[3]) + estimateMessageTokens(messages[4])
      // Enough for first + pair B + last two, but NOT pair A
      const limit = firstTokens + pairBTokens + lastTwoTokens + 10

      const result = truncateOldMessages(messages, limit)

      // Verify no orphaned tool_use or tool_result
      for (let i = 0; i < result.length; i++) {
        const msg = result[i]
        if (typeof msg.content === 'string') continue

        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            // Next message must have matching tool_result
            const next = result[i + 1]
            expect(next).toBeDefined()
            expect(typeof next.content).not.toBe('string')
            const resultBlock = (next.content as any[]).find(
              (b: any) => b.type === 'tool_result' && b.tool_use_id === block.id
            )
            expect(resultBlock).toBeDefined()
          }
        }
      }
    })

    it('removes both tool_use and tool_result when pair does not fit', () => {
      const messages: Message[] = [
        userText('start'),
        assistantToolUse('tool_1'),
        userToolResult('tool_1', 'big_result'.repeat(500)),
        assistantText('done'),
      ]

      // Enough for first + last text, but not the tool pair
      const firstTokens = estimateMessageTokens(messages[0])
      const lastTokens = estimateMessageTokens(messages[3])
      const limit = firstTokens + lastTokens + 10

      const result = truncateOldMessages(messages, limit)
      expect(result).toEqual([messages[0], messages[3]])
    })

    it('handles mixed text and tool_use in one assistant message', () => {
      const messages: Message[] = [
        userText('start'),
        assistantTextAndToolUse('let me check', 'tool_1'),
        userToolResult('tool_1', 'result'),
        assistantText('final'),
      ]

      // Enough for everything
      const result = truncateOldMessages(messages, 100000)
      expect(result).toEqual(messages)
    })

    it('handles multiple sequential tool pairs correctly', () => {
      const bigPayload = 'x'.repeat(4000) // ~1000 tokens
      const messages: Message[] = [
        userText('start'),
        assistantToolUse('t1'),
        userToolResult('t1', bigPayload),
        assistantToolUse('t2'),
        userToolResult('t2', bigPayload),
        assistantToolUse('t3'),
        userToolResult('t3', bigPayload),
        assistantText('summary'),
        userText('ok'),
      ]

      // Only enough for first + last pair + last two messages
      const firstTokens = estimateMessageTokens(messages[0])
      const pair3Tokens = estimateMessageTokens(messages[5]) + estimateMessageTokens(messages[6])
      const lastTwoTokens = estimateMessageTokens(messages[7]) + estimateMessageTokens(messages[8])
      const limit = firstTokens + pair3Tokens + lastTwoTokens + 10

      const result = truncateOldMessages(messages, limit)

      // Should have: first, pair3, last two
      expect(result[0]).toEqual(messages[0])
      expect(result).toContain(messages[5])
      expect(result).toContain(messages[6])
      expect(result).toContain(messages[7])
      expect(result).toContain(messages[8])
      // Should NOT contain pair 1 or pair 2
      expect(result).not.toContain(messages[1])
      expect(result).not.toContain(messages[2])
      expect(result).not.toContain(messages[3])
      expect(result).not.toContain(messages[4])
    })
  })
})

describe('ContextManager', () => {
  it('returns messages unchanged when within limit', () => {
    const cm = new ContextManager(100000)
    const messages: Message[] = [userText('hello'), assistantText('hi')]
    expect(cm.manageContext(messages)).toEqual(messages)
  })

  it('truncates while preserving tool pairs when over limit', () => {
    const cm = new ContextManager(500) // small limit
    const messages: Message[] = [
      userText('start'),
      assistantToolUse('t1'),
      userToolResult('t1', 'x'.repeat(2000)),
      assistantText('end'),
    ]

    const result = cm.manageContext(messages)

    // Tool pair should be removed as a unit, not split
    for (let i = 0; i < result.length; i++) {
      const msg = result[i]
      if (typeof msg.content === 'string') continue
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          const next = result[i + 1]
          expect(next).toBeDefined()
        }
        if (block.type === 'tool_result') {
          const prev = result[i - 1]
          expect(prev).toBeDefined()
          expect(typeof prev.content).not.toBe('string')
        }
      }
    }
  })
})
