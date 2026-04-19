import { describe, it, expect } from 'vitest'
import { executeLoop } from './executor.js'
import { ContextManager } from './context-manager.js'
import { TaskManager } from './tools/tasks.js'
import type { LLMProvider, LLMResponse, Message, Tool, ToolContext, ToolSchema } from './types.js'

const toolContext: ToolContext = {
  remainingTokens: 100000,
  conversationId: 'c1',
  userId: 'u1'
}

function makeTool(name: string): Tool {
  return {
    name,
    description: `${name} tool`,
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true, data: { ok: true } })
  }
}

function recordingLLM(response: LLMResponse): { llm: LLMProvider; calls: ToolSchema[][] } {
  const calls: ToolSchema[][] = []
  const llm: LLMProvider = {
    chat: async (_sys, _msgs, tools) => {
      calls.push(tools)
      return response
    },
    getModelId: () => 'stub:stub',
    supportsNativeTools: true
  }
  return { llm, calls }
}

describe('executor deferred tool preload', () => {
  const endTurn: LLMResponse = { content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' }

  it('preloads deferred tools that appear as tool_use in history', async () => {
    const saveMeal = makeTool('save_meal')
    const listMeals = makeTool('list_meals')
    const { llm, calls } = recordingLLM(endTurn)

    const history: Message[] = [
      { role: 'user', content: 'log eggs' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'ts', name: '__tool_search__', input: { query: 'select:save_meal' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ts', content: 'ok' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'save_meal', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      { role: 'user', content: 'and?' }
    ]

    await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 2,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager(),
        deferredTools: [saveMeal, listMeals]
      },
      history,
      toolContext
    )

    const names = calls[0].map(s => s.name).sort()
    expect(names).toEqual(['save_meal'])
  })

  it('ignores tool_use entries not present in deferredTools', async () => {
    const saveMeal = makeTool('save_meal')
    const { llm, calls } = recordingLLM(endTurn)

    const history: Message[] = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'unknown_tool', input: {} }] },
      { role: 'user', content: 'hi' }
    ]

    await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 2,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager(),
        deferredTools: [saveMeal]
      },
      history,
      toolContext
    )

    expect(calls[0]).toEqual([])
  })

  it('preserves select order from __tool_search__ even when call order differs', async () => {
    const saveMeal = makeTool('save_meal')
    const listMeals = makeTool('list_meals')
    const { llm, calls } = recordingLLM(endTurn)

    const history: Message[] = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'ts', name: '__tool_search__', input: { query: 'select:save_meal,list_meals' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ts', content: 'ok' }] },
      // Called in reverse order — preload should still match load order.
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'list_meals', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'save_meal', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }] },
      { role: 'user', content: 'again' }
    ]

    await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 2,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager(),
        deferredTools: [saveMeal, listMeals]
      },
      history,
      toolContext
    )

    expect(calls[0].map(s => s.name)).toEqual(['save_meal', 'list_meals'])
  })

  it('deduplicates when history contains the same tool_use multiple times', async () => {
    const saveMeal = makeTool('save_meal')
    const { llm, calls } = recordingLLM(endTurn)

    const history: Message[] = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'ts', name: '__tool_search__', input: { query: 'select:save_meal' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ts', content: 'ok' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'save_meal', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'save_meal', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }] },
      { role: 'user', content: 'again' }
    ]

    await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 2,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager(),
        deferredTools: [saveMeal]
      },
      history,
      toolContext
    )

    expect(calls[0].filter(s => s.name === 'save_meal')).toHaveLength(1)
  })

  it('empty history leaves only core tools in the first LLM call', async () => {
    const saveMeal = makeTool('save_meal')
    const { llm, calls } = recordingLLM(endTurn)

    await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 2,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager(),
        deferredTools: [saveMeal]
      },
      [{ role: 'user', content: 'hello' }],
      toolContext
    )

    expect(calls[0]).toEqual([])
  })

  it('preloaded tool is executable via the normal tool dispatch path', async () => {
    const saveMeal = makeTool('save_meal')
    const toolCallResponse: LLMResponse = {
      content: [{ type: 'tool_use', id: 'tcall', name: 'save_meal', input: { item: 'eggs' } }],
      stopReason: 'tool_use'
    }
    let callCount = 0
    const llm: LLMProvider = {
      chat: async () => {
        callCount++
        return callCount === 1 ? toolCallResponse : endTurn
      },
      getModelId: () => 'stub:stub',
      supportsNativeTools: true
    }

    const history: Message[] = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'save_meal', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
      { role: 'user', content: 'again' }
    ]

    const result = await executeLoop(
      {
        systemPrompt: 'sys',
        tools: [],
        llm,
        maxIterations: 3,
        contextManager: new ContextManager(100000, 'summarize'),
        taskManager: new TaskManager(),
        deferredTools: [saveMeal]
      },
      history,
      toolContext
    )

    expect(result.toolCalls.map(c => c.name)).toContain('save_meal')
    expect(result.toolCalls[0].output.success).toBe(true)
  })
})
