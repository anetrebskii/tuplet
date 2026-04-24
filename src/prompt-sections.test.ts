import { describe, it, expect } from 'vitest'
import { Tuplet } from './agent.js'
import { MemoryRepository } from './providers/repository/memory.js'
import {
  resolveSections,
  evaluateInjections,
  formatSectionsForPrompt,
  wrapInjection,
  renderInjectionsPayload,
  countUserTurns,
  extractLastUserText,
  loadTupletState,
} from './prompt-sections.js'
import type {
  LLMProvider,
  LLMResponse,
  Message,
  PromptSection,
  HistoryInjection,
  SectionContext,
  TurnContext,
} from './types.js'

const endTurn: LLMResponse = {
  content: [{ type: 'text', text: 'done' }],
  stopReason: 'end_turn',
  usage: { inputTokens: 1, outputTokens: 1 },
}

function recordingLLM(response: LLMResponse = endTurn) {
  const calls: { system: string; messages: Message[] }[] = []
  const llm: LLMProvider = {
    chat: async (system, messages) => {
      calls.push({ system, messages: JSON.parse(JSON.stringify(messages)) })
      return response
    },
    getModelId: () => 'stub:stub',
    supportsNativeTools: true,
  }
  return { llm, calls }
}

describe('pure helpers', () => {
  it('countUserTurns ignores tool_result-only messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'again' },
    ]
    expect(countUserTurns(messages)).toBe(2)
  })

  it('extractLastUserText walks backward through messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] },
      { role: 'user', content: 'latest' },
    ]
    expect(extractLastUserText(messages)).toBe('latest')
  })

  it('wrapInjection uses <tuplet-note> with kind and name attrs', () => {
    const wrapped = wrapInjection('restoration-mode', 'be gentle')
    expect(wrapped).toContain('<tuplet-note kind="history-injection" name="restoration-mode">')
    expect(wrapped).toContain('</tuplet-note>')
    expect(wrapped).toContain('be gentle')
  })

  it('renderInjectionsPayload joins multiple injections into one block', () => {
    const payload = renderInjectionsPayload([
      { name: 'a', content: 'first', once: true },
      { name: 'b', content: 'second', once: false },
    ])
    expect(payload).toMatch(/name="a"[\s\S]*first[\s\S]*name="b"[\s\S]*second/)
  })

  it('formatSectionsForPrompt wraps each section', () => {
    const out = formatSectionsForPrompt([
      { name: 'admin', content: 'admin stuff' },
      { name: 'source', content: 'cron source' },
    ])
    expect(out).toContain('kind="prompt-section" name="admin"')
    expect(out).toContain('kind="prompt-section" name="source"')
    expect(out).toContain('admin stuff')
    expect(out).toContain('cron source')
  })
})

describe('resolveSections', () => {
  const ctx: SectionContext = { context: { isAdmin: true }, conversationId: 'c1' }

  it('evaluates sections whose when returns true', async () => {
    const sections: PromptSection[] = [
      { name: 'admin', when: c => (c.context as { isAdmin: boolean }).isAdmin, content: 'ADMIN' },
      { name: 'guest', when: () => false, content: 'GUEST' },
    ]
    const { fired, updatedCache } = await resolveSections(sections, ctx, undefined)
    expect(fired.map(f => f.name)).toEqual(['admin'])
    expect(fired[0].content).toBe('ADMIN')
    expect(updatedCache.admin).toEqual({ fired: true, content: 'ADMIN' })
    expect(updatedCache.guest).toEqual({ fired: false })
  })

  it('reads from cache on subsequent runs without re-evaluating', async () => {
    let evalCount = 0
    const sections: PromptSection[] = [
      {
        name: 'admin',
        when: () => {
          evalCount++
          return true
        },
        content: 'A',
      },
    ]
    const { updatedCache } = await resolveSections(sections, ctx, undefined)
    expect(evalCount).toBe(1)

    const second = await resolveSections(sections, ctx, updatedCache)
    expect(evalCount).toBe(1)
    expect(second.fired.map(f => f.name)).toEqual(['admin'])
  })

  it('awaits async predicates and async content', async () => {
    const sections: PromptSection[] = [
      {
        name: 'async',
        when: async () => true,
        content: async () => 'async-content',
      },
    ]
    const { fired } = await resolveSections(sections, ctx, undefined)
    expect(fired[0].content).toBe('async-content')
  })

  it('preserves registration order', async () => {
    const sections: PromptSection[] = [
      { name: 'a', when: () => true, content: 'A' },
      { name: 'b', when: () => true, content: 'B' },
      { name: 'c', when: () => true, content: 'C' },
    ]
    const { fired } = await resolveSections(sections, ctx, undefined)
    expect(fired.map(f => f.name)).toEqual(['a', 'b', 'c'])
  })
})

describe('evaluateInjections', () => {
  const ctx: TurnContext = {
    context: { mood: 'stressed' },
    conversationId: 'c1',
    turnIndex: 1,
    lastUserMessage: 'help',
  }

  it('fires injections whose when returns true', async () => {
    const injections: HistoryInjection[] = [
      {
        name: 'stress',
        when: c => (c.context as { mood: string }).mood === 'stressed',
        content: 'be gentle',
      },
      { name: 'happy', when: () => false, content: 'celebrate' },
    ]
    const fired = await evaluateInjections(injections, ctx, [])
    expect(fired.map(f => f.name)).toEqual(['stress'])
  })

  it('skips once-fired injections by default', async () => {
    const injections: HistoryInjection[] = [
      { name: 'stress', when: () => true, content: 'x' },
    ]
    const fired = await evaluateInjections(injections, ctx, ['stress'])
    expect(fired).toEqual([])
  })

  it('re-fires once:false injections even when listed as fired', async () => {
    const injections: HistoryInjection[] = [
      { name: 'recurring', once: false, when: () => true, content: 'x' },
    ]
    const fired = await evaluateInjections(injections, ctx, ['recurring'])
    expect(fired.map(f => f.name)).toEqual(['recurring'])
  })
})

describe('Tuplet integration', () => {
  it('appends fired PromptSection content to the system prompt on turn 1', async () => {
    const { llm, calls } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      sections: [
        {
          name: 'admin',
          when: ctx => (ctx.context as { admin: boolean }).admin,
          content: 'ADMIN_GUIDE_TEXT',
        },
        { name: 'guest', when: () => false, content: 'GUEST_GUIDE' },
      ],
    })
    await agent.run('hello', { context: { admin: true } })
    expect(calls[0].system).toContain('ADMIN_GUIDE_TEXT')
    expect(calls[0].system).toContain('kind="prompt-section" name="admin"')
    expect(calls[0].system).not.toContain('GUEST_GUIDE')
  })

  it('caches section evaluation across runs (no re-evaluation on turn 2)', async () => {
    const { llm } = recordingLLM()
    const repo = new MemoryRepository()
    let evalCount = 0
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      sections: [
        {
          name: 'p',
          when: () => {
            evalCount++
            return true
          },
          content: 'P',
        },
      ],
    })
    await agent.run('one', { conversationId: 'c1' })
    await agent.run('two', { conversationId: 'c1' })
    expect(evalCount).toBe(1)
  })

  it('inserts HistoryInjection wrapped in <tuplet-note> before the current user msg', async () => {
    const { llm, calls } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      historyInjections: [
        { name: 'stress', when: () => true, content: 'be gentle' },
      ],
    })
    await agent.run('I am tired', {})

    const msgs = calls[0].messages
    // Expected: injection-user, ack-asst, real-user
    expect(msgs).toHaveLength(3)
    expect(msgs[0].role).toBe('user')
    expect(typeof msgs[0].content === 'string' ? msgs[0].content : '')
      .toContain('<tuplet-note kind="history-injection" name="stress">')
    expect(typeof msgs[0].content === 'string' ? msgs[0].content : '').toContain('be gentle')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[2].role).toBe('user')
    expect(msgs[2].content).toBe('I am tired')
  })

  it('HistoryInjection once:true (default) does not re-fire on the next run', async () => {
    const { llm, calls } = recordingLLM()
    const repo = new MemoryRepository()
    let fireCount = 0
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      historyInjections: [
        {
          name: 'once-only',
          when: () => {
            fireCount++
            return true
          },
          content: 'first-only note',
        },
      ],
    })
    await agent.run('first', { conversationId: 'c1' })
    await agent.run('second', { conversationId: 'c1' })

    // Once the injection has fired, subsequent runs short-circuit and do not
    // re-evaluate its `when` predicate.
    expect(fireCount).toBe(1)

    const secondCallSystem = calls[1].messages
      .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n')
    // Should not contain a fresh injection — but the FIRST injection is still
    // in history (persisted from turn 1). Assert the second call does not have
    // TWO injection blocks.
    const occurrences = secondCallSystem.match(/name="once-only"/g)?.length ?? 0
    expect(occurrences).toBe(1)
  })

  it('HistoryInjection once:false fires every turn', async () => {
    const { llm, calls } = recordingLLM()
    const repo = new MemoryRepository()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      historyInjections: [
        { name: 'heartbeat', once: false, when: () => true, content: 'ping' },
      ],
    })
    await agent.run('one', { conversationId: 'c1' })
    await agent.run('two', { conversationId: 'c1' })

    // First call has 1 injection + 1 ack + 1 user = 3 messages
    expect(calls[0].messages).toHaveLength(3)

    // Second call history: [injection1, ack, user1, asst, injection2, ack, user2]
    const second = calls[1].messages
    const userTextMsgs = second.filter(
      m => m.role === 'user' && typeof m.content === 'string' && !m.content.includes('<tuplet-note')
    )
    expect(userTextMsgs.map(m => m.content)).toEqual(['one', 'two'])

    const injectionMsgs = second.filter(
      m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('<tuplet-note kind="history-injection"')
    )
    expect(injectionMsgs).toHaveLength(2)
  })

  it('persists firedInjections across runs in repository state', async () => {
    const { llm } = recordingLLM()
    const repo = new MemoryRepository()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      historyInjections: [{ name: 'fired-once', when: () => true, content: 'x' }],
    })
    await agent.run('hi', { conversationId: 'c1' })
    const state = await loadTupletState(repo, 'c1')
    expect(state.firedInjections).toEqual(['fired-once'])
  })

  it('merges multiple simultaneous injections into one user message', async () => {
    const { llm, calls } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      historyInjections: [
        { name: 'a', when: () => true, content: 'A' },
        { name: 'b', when: () => true, content: 'B' },
      ],
    })
    await agent.run('hello', {})
    const msgs = calls[0].messages
    expect(msgs).toHaveLength(3)
    const payload = typeof msgs[0].content === 'string' ? msgs[0].content : ''
    expect(payload).toContain('name="a"')
    expect(payload).toContain('name="b"')
  })

  it('does not evaluate sections or injections when resuming from __ask_user__', async () => {
    const { llm } = recordingLLM()
    let sectionCalls = 0
    let injectionCalls = 0
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      sections: [
        {
          name: 's',
          when: () => {
            sectionCalls++
            return true
          },
          content: 'S',
        },
      ],
      historyInjections: [
        {
          name: 'i',
          when: () => {
            injectionCalls++
            return true
          },
          content: 'I',
        },
      ],
    })

    // Simulate a resume: history ends with assistant __ask_user__ tool_use
    const history: Message[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'ask1',
            name: '__ask_user__',
            input: { questions: [{ question: 'Which?' }] },
          },
        ],
      },
    ]
    await agent.run('my answer', { history })

    // Section still evaluates (turn 1 was never completed, and sections are
    // cached for the session). Injection must NOT fire on resume.
    expect(injectionCalls).toBe(0)
    // Sections evaluate once regardless of resume — resume is mid-turn.
    expect(sectionCalls).toBe(1)
  })

  it('Tuplet.resolveSections returns fired sections without repository state', async () => {
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm: recordingLLM().llm,
      sections: [
        { name: 'yes', when: c => (c.context as { x: boolean }).x, content: 'YES' },
        { name: 'no', when: c => !(c.context as { x: boolean }).x, content: 'NO' },
      ],
    })
    const fired = await agent.resolveSections({ context: { x: true }, conversationId: 'c' })
    expect(fired.map(f => f.name)).toEqual(['yes'])
  })

  it('Tuplet.evaluateInjections respects firedNames', async () => {
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm: recordingLLM().llm,
      historyInjections: [
        { name: 'a', when: () => true, content: 'A' },
        { name: 'b', when: () => true, content: 'B' },
      ],
    })
    const fired = await agent.evaluateInjections(
      { context: {}, conversationId: 'c', turnIndex: 1, lastUserMessage: '' },
      ['a']
    )
    expect(fired.map(f => f.name)).toEqual(['b'])
  })

  it('invalidateSection clears a section from cache so it re-evaluates', async () => {
    const { llm } = recordingLLM()
    const repo = new MemoryRepository()
    let evalCount = 0
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      sections: [
        {
          name: 'dyn',
          when: () => {
            evalCount++
            return true
          },
          content: () => `v${evalCount}`,
        },
      ],
    })
    await agent.run('one', { conversationId: 'c1' })
    expect(evalCount).toBe(1)

    // Without invalidation, a second run would use cache.
    await agent.run('two', { conversationId: 'c1' })
    expect(evalCount).toBe(1)

    await agent.invalidateSection('c1', 'dyn')
    await agent.run('three', { conversationId: 'c1' })
    expect(evalCount).toBe(2)
  })

  it('AgentResult.firedHistoryInjections reflects the when truth table', async () => {
    const { llm } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      historyInjections: [
        { name: 'yes-1', when: () => true, content: 'Y1' },
        { name: 'no', when: () => false, content: 'N' },
        { name: 'yes-2', when: () => true, content: 'Y2' },
      ],
    })
    const result = await agent.run('hi', {})
    expect(result.firedHistoryInjections).toEqual(['yes-1', 'yes-2'])
  })

  it('AgentResult.firedHistoryInjections is empty when no injection fires', async () => {
    const { llm } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      historyInjections: [
        { name: 'none', when: () => false, content: 'x' },
      ],
    })
    const result = await agent.run('hi', {})
    expect(result.firedHistoryInjections).toEqual([])
  })

  it('AgentResult.firedHistoryInjections is a per-run delta (empty on subsequent run once fired)', async () => {
    const { llm } = recordingLLM()
    const repo = new MemoryRepository()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      historyInjections: [
        { name: 'once-only', when: () => true, content: 'x' },
      ],
    })
    const first = await agent.run('hi', { conversationId: 'c1' })
    expect(first.firedHistoryInjections).toEqual(['once-only'])

    const second = await agent.run('again', { conversationId: 'c1' })
    expect(second.firedHistoryInjections).toEqual([])
  })

  it('AgentResult.firedHistoryInjections is undefined when no historyInjections are configured', async () => {
    const { llm } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
    })
    const result = await agent.run('hi', {})
    expect(result.firedHistoryInjections).toBeUndefined()
  })

  it('AgentResult.firedPromptSections includes only sections whose when matched', async () => {
    const { llm } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      sections: [
        { name: 'admin', when: c => (c.context as { admin: boolean }).admin, content: 'ADMIN' },
        { name: 'guest', when: () => false, content: 'GUEST' },
        { name: 'always', when: () => true, content: 'ALWAYS' },
      ],
    })
    const result = await agent.run('hi', { context: { admin: true } })
    expect(result.firedPromptSections).toEqual(['admin', 'always'])
  })

  it('AgentResult.firedPromptSections is stable across subsequent runs (active set, not delta)', async () => {
    const { llm } = recordingLLM()
    const repo = new MemoryRepository()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      sections: [
        { name: 'active', when: () => true, content: 'A' },
        { name: 'inactive', when: () => false, content: 'B' },
      ],
    })
    const first = await agent.run('one', { conversationId: 'c1' })
    const second = await agent.run('two', { conversationId: 'c1' })
    expect(first.firedPromptSections).toEqual(['active'])
    expect(second.firedPromptSections).toEqual(['active'])
  })

  it('AgentResult.firedPromptSections is undefined when no sections are configured', async () => {
    const { llm } = recordingLLM()
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
    })
    const result = await agent.run('hi', {})
    expect(result.firedPromptSections).toBeUndefined()
  })

  it('TurnContext exposes turnIndex and lastUserMessage', async () => {
    const { llm } = recordingLLM()
    const repo = new MemoryRepository()
    const seen: Array<{ turnIndex: number; lastUserMessage: string }> = []
    const agent = new Tuplet({
      role: 'tester',
      tools: [],
      agents: [],
      llm,
      repository: repo,
      historyInjections: [
        {
          name: 'watch',
          once: false,
          when: ctx => {
            seen.push({ turnIndex: ctx.turnIndex, lastUserMessage: ctx.lastUserMessage })
            return false
          },
          content: '',
        },
      ],
    })
    await agent.run('first message', { conversationId: 'c1' })
    await agent.run('second message', { conversationId: 'c1' })
    expect(seen).toEqual([
      { turnIndex: 1, lastUserMessage: 'first message' },
      { turnIndex: 2, lastUserMessage: 'second message' },
    ])
  })
})
