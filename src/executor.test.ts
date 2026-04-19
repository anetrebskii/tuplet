import { describe, it, expect } from 'vitest'
import { executeLoop } from './executor.js'
import { ContextManager } from './context-manager.js'
import { TaskManager } from './tools/tasks.js'
import { defaultSanitize } from './sanitize.js'
import type { LLMProvider, LLMResponse, Message, ToolContext } from './types.js'

function stubLLM(response: LLMResponse): LLMProvider {
  return {
    chat: async () => response,
    getModelId: () => 'stub:stub',
    supportsNativeTools: true
  }
}

const toolContext: ToolContext = {
  remainingTokens: 100000,
  conversationId: 'c1',
  userId: 'u1'
}

describe('executor sanitization', () => {
  it('sanitizer runs before assistant message is persisted to history', async () => {
    const llm = stubLLM({
      content: [{ type: 'text', text: 'thought\nhi' }],
      stopReason: 'end_turn'
    })

    const messages: Message[] = [{ role: 'user', content: 'hello' }]

    const result = await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 5,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager(),
        sanitize: defaultSanitize
      },
      messages,
      toolContext
    )

    const lastAssistant = result.history[result.history.length - 1]
    expect(lastAssistant.role).toBe('assistant')
    expect(lastAssistant.content).toEqual([{ type: 'text', text: 'hi' }])
    expect(result.response).toBe('hi')
  })

  it('leaves raw output when sanitize is not provided', async () => {
    const llm = stubLLM({
      content: [{ type: 'text', text: 'thought\nhi' }],
      stopReason: 'end_turn'
    })

    const result = await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 5,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager()
      },
      [{ role: 'user', content: 'hello' }],
      toolContext
    )

    expect(result.response).toBe('thought\nhi')
  })
})
