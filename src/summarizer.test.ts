import { describe, it, expect, vi } from 'vitest'
import { parseSummary, summarizeMessages, microCompact } from './summarizer.js'
import type { Message, LLMProvider, LLMResponse } from './types.js'

// ============================================================
// Helpers
// ============================================================

function userText(text: string): Message {
  return { role: 'user', content: text }
}

function assistantText(text: string): Message {
  return { role: 'assistant', content: text }
}

function userToolResult(toolUseId: string, content: string): Message {
  return {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
  }
}

function assistantToolUse(id: string, name: string = '__shell__'): Message {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', id, name, input: {} }],
  }
}

function createMockLLM(responseText: string): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: responseText }],
      stopReason: 'end_turn',
    } satisfies LLMResponse),
  }
}

// ============================================================
// parseSummary
// ============================================================

describe('parseSummary', () => {
  it('extracts content from <summary> tags', () => {
    const response = '<analysis>thinking...</analysis>\n<summary>\nThis is the summary.\n</summary>'
    expect(parseSummary(response)).toBe('This is the summary.')
  })

  it('handles multi-line summary content', () => {
    const response = '<summary>\nLine 1\nLine 2\nLine 3\n</summary>'
    expect(parseSummary(response)).toBe('Line 1\nLine 2\nLine 3')
  })

  it('falls back to full response when no <summary> tags', () => {
    const response = 'No tags here, just a summary.'
    expect(parseSummary(response)).toBe('No tags here, just a summary.')
  })

  it('handles empty summary tags', () => {
    const response = '<summary></summary>'
    expect(parseSummary(response)).toBe('')
  })
})

// ============================================================
// summarizeMessages
// ============================================================

describe('summarizeMessages', () => {
  it('calls LLM with conversation text and returns parsed summary', async () => {
    const llm = createMockLLM('<analysis>Analysis here</analysis>\n<summary>The user asked to fix a bug in auth.ts</summary>')

    const messages: Message[] = [
      userText('Fix the bug in auth.ts'),
      assistantText('I found the issue in the login function.'),
    ]

    const result = await summarizeMessages(messages, llm)
    expect(result).toBe('The user asked to fix a bug in auth.ts')

    // Verify LLM was called with correct structure
    expect(llm.chat).toHaveBeenCalledTimes(1)
    const [systemPrompt, msgs, tools] = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(systemPrompt).toContain('summarizing a conversation')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toContain('Fix the bug in auth.ts')
    expect(tools).toEqual([])
  })

  it('includes tool_use and tool_result in conversation text', async () => {
    const llm = createMockLLM('<summary>Used shell to list files</summary>')

    const messages: Message[] = [
      userText('List files'),
      assistantToolUse('t1', '__shell__'),
      userToolResult('t1', 'file1.ts\nfile2.ts'),
      assistantText('Found 2 files.'),
    ]

    await summarizeMessages(messages, llm)

    const conversationText = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][1][0].content as string
    expect(conversationText).toContain('__shell__')
    expect(conversationText).toContain('file1.ts')
  })

  it('passes custom instructions when provided', async () => {
    const llm = createMockLLM('<summary>Summary</summary>')

    await summarizeMessages(
      [userText('hello')],
      llm,
      { customInstructions: 'Focus on error handling' }
    )

    const systemPrompt = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(systemPrompt).toContain('Focus on error handling')
  })
})

// ============================================================
// microCompact
// ============================================================

describe('microCompact', () => {
  it('returns messages unchanged when no tool_results exist', () => {
    const messages: Message[] = [
      userText('hello'),
      assistantText('hi'),
    ]
    expect(microCompact(messages)).toEqual(messages)
  })

  it('returns messages unchanged when all tool_results are recent', () => {
    const messages: Message[] = [
      assistantToolUse('t1'),
      userToolResult('t1', 'x'.repeat(2000)),
      assistantToolUse('t2'),
      userToolResult('t2', 'y'.repeat(2000)),
    ]
    // keepRecent defaults to 3, we only have 2 tool_results
    expect(microCompact(messages)).toEqual(messages)
  })

  it('truncates old large tool_results, keeps recent ones intact', () => {
    const messages: Message[] = [
      assistantToolUse('t1'),
      userToolResult('t1', 'a'.repeat(2000)),  // old, large → truncate
      assistantToolUse('t2'),
      userToolResult('t2', 'b'.repeat(2000)),  // old, large → truncate
      assistantToolUse('t3'),
      userToolResult('t3', 'c'.repeat(2000)),  // recent → keep
      assistantToolUse('t4'),
      userToolResult('t4', 'd'.repeat(2000)),  // recent → keep
      assistantToolUse('t5'),
      userToolResult('t5', 'e'.repeat(2000)),  // recent → keep
    ]

    const result = microCompact(messages, 3)

    // First two tool_results should be truncated
    const block1 = (result[1].content as any[])[0]
    expect(block1.content).toContain('[tool result truncated')
    expect(block1.content).toContain('2000 chars')

    const block2 = (result[3].content as any[])[0]
    expect(block2.content).toContain('[tool result truncated')

    // Last three should be intact
    const block3 = (result[5].content as any[])[0]
    expect(block3.content).toBe('c'.repeat(2000))

    const block4 = (result[7].content as any[])[0]
    expect(block4.content).toBe('d'.repeat(2000))

    const block5 = (result[9].content as any[])[0]
    expect(block5.content).toBe('e'.repeat(2000))
  })

  it('does not truncate small tool_results even if old', () => {
    const messages: Message[] = [
      assistantToolUse('t1'),
      userToolResult('t1', 'small'),  // old but small (< 1000 chars)
      assistantToolUse('t2'),
      userToolResult('t2', 'x'.repeat(2000)),
      assistantToolUse('t3'),
      userToolResult('t3', 'y'.repeat(2000)),
      assistantToolUse('t4'),
      userToolResult('t4', 'z'.repeat(2000)),
    ]

    const result = microCompact(messages, 3)

    // First tool_result is small, should stay intact even though it's old
    const block1 = (result[1].content as any[])[0]
    expect(block1.content).toBe('small')
  })

  it('does not mutate original messages', () => {
    const messages: Message[] = [
      assistantToolUse('t1'),
      userToolResult('t1', 'x'.repeat(2000)),
      assistantToolUse('t2'),
      userToolResult('t2', 'y'.repeat(2000)),
      assistantToolUse('t3'),
      userToolResult('t3', 'z'.repeat(2000)),
      assistantToolUse('t4'),
      userToolResult('t4', 'w'.repeat(2000)),
    ]

    const originalContent = ((messages[1].content as any[])[0]).content
    microCompact(messages, 3)

    // Original should be unchanged
    expect(((messages[1].content as any[])[0]).content).toBe(originalContent)
  })

  it('respects custom keepRecent parameter', () => {
    const messages: Message[] = [
      assistantToolUse('t1'),
      userToolResult('t1', 'a'.repeat(2000)),
      assistantToolUse('t2'),
      userToolResult('t2', 'b'.repeat(2000)),
    ]

    // Keep only 1 recent
    const result = microCompact(messages, 1)

    // First should be truncated
    const block1 = (result[1].content as any[])[0]
    expect(block1.content).toContain('[tool result truncated')

    // Second should be intact
    const block2 = (result[3].content as any[])[0]
    expect(block2.content).toBe('b'.repeat(2000))
  })
})
