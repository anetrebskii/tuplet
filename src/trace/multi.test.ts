import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MultiTraceProvider } from './multi.js'
import type {
  Trace,
  TraceProvider,
  AgentSpan,
  LLMCallEvent,
  ToolCallEvent,
  ModelPricing,
  CostUpdate
} from './types.js'

function makeSpan(overrides: Partial<AgentSpan> = {}): AgentSpan {
  return {
    type: 'agent',
    spanId: 'span_1',
    agentName: 'root',
    depth: 0,
    startTime: 0,
    events: [],
    children: [],
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalLLMCalls: 0,
    totalToolCalls: 0,
    ...overrides
  }
}

function makeTrace(): Trace {
  return {
    traceId: 'trace_1',
    rootSpan: makeSpan(),
    startTime: 0,
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalLLMCalls: 0,
    totalToolCalls: 0,
    costByModel: {}
  }
}

function makeLLMEvent(): LLMCallEvent {
  return {
    type: 'llm_call',
    spanId: 'span_llm',
    modelId: 'm',
    inputTokens: 1,
    outputTokens: 1,
    cost: 0,
    durationMs: 1,
    timestamp: 1
  }
}

function makeToolEvent(): ToolCallEvent {
  return {
    type: 'tool_call',
    spanId: 'span_tool',
    toolName: 't',
    input: {},
    output: { success: true },
    durationMs: 1,
    timestamp: 1
  }
}

function makeProvider(): TraceProvider {
  return {
    onTraceStart: vi.fn(),
    onTraceEnd: vi.fn(),
    onAgentStart: vi.fn(),
    onAgentEnd: vi.fn(),
    onLLMCall: vi.fn(),
    onToolCall: vi.fn(),
    onCostUpdate: vi.fn()
  }
}

describe('MultiTraceProvider', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errSpy.mockRestore()
  })

  it('fans out every callback to every child provider', async () => {
    const a = makeProvider()
    const b = makeProvider()
    const multi = new MultiTraceProvider([a, b])

    const trace = makeTrace()
    const span = makeSpan()
    const llm = makeLLMEvent()
    const tool = makeToolEvent()
    const cost: CostUpdate = {
      callCost: 1,
      cumulativeCost: 1,
      inputTokens: 1,
      outputTokens: 1,
      modelId: 'm'
    }

    await multi.onTraceStart(trace)
    await multi.onTraceEnd(trace)
    await multi.onAgentStart(span, trace)
    await multi.onAgentEnd(span, trace)
    await multi.onLLMCall(llm, span, trace)
    await multi.onToolCall(tool, span, trace)
    await multi.onCostUpdate(cost)

    for (const p of [a, b]) {
      expect(p.onTraceStart).toHaveBeenCalledWith(trace)
      expect(p.onTraceEnd).toHaveBeenCalledWith(trace)
      expect(p.onAgentStart).toHaveBeenCalledWith(span, trace)
      expect(p.onAgentEnd).toHaveBeenCalledWith(span, trace)
      expect(p.onLLMCall).toHaveBeenCalledWith(llm, span, trace)
      expect(p.onToolCall).toHaveBeenCalledWith(tool, span, trace)
      expect(p.onCostUpdate).toHaveBeenCalledWith(cost)
    }
  })

  it('isolates errors so one bad provider does not block the others', async () => {
    const bad: TraceProvider = {
      ...makeProvider(),
      onLLMCall: vi.fn(() => {
        throw new Error('boom')
      })
    }
    const badAsync: TraceProvider = {
      ...makeProvider(),
      onLLMCall: vi.fn(async () => {
        throw new Error('boom-async')
      })
    }
    const good = makeProvider()

    const multi = new MultiTraceProvider([bad, badAsync, good])
    const span = makeSpan()
    const trace = makeTrace()

    await expect(multi.onLLMCall(makeLLMEvent(), span, trace)).resolves.toBeUndefined()
    expect(good.onLLMCall).toHaveBeenCalledTimes(1)
    expect(errSpy).toHaveBeenCalledTimes(2)
  })

  it('resolves modelPricing to the first child that defines one', () => {
    const pricing: Record<string, ModelPricing> = {
      foo: { inputPer1M: 1, outputPer1M: 2 }
    }
    const a: TraceProvider = makeProvider()
    const b: TraceProvider = { ...makeProvider(), modelPricing: pricing }
    const c: TraceProvider = {
      ...makeProvider(),
      modelPricing: { bar: { inputPer1M: 9, outputPer1M: 9 } }
    }

    const multi = new MultiTraceProvider([a, b, c])
    expect(multi.modelPricing).toBe(pricing)
  })

  it('flush() and shutdown() fan out to children that implement them', async () => {
    const flush = vi.fn(async () => {})
    const shutdown = vi.fn(async () => {})
    const flushable = Object.assign(makeProvider(), { flush, shutdown })
    const plain = makeProvider()

    const multi = new MultiTraceProvider([flushable, plain])
    await multi.flush()
    await multi.shutdown()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('flush() swallows errors from children', async () => {
    const flushable = Object.assign(makeProvider(), {
      flush: vi.fn(async () => {
        throw new Error('flush-fail')
      })
    })
    const multi = new MultiTraceProvider([flushable])
    await expect(multi.flush()).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledTimes(1)
  })
})
