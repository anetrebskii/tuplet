import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterProvider, isFuzzyResponse } from './openrouter.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function okChoice(opts: {
  content?: string | null
  tool_calls?: Array<{ id: string; name: string; args?: unknown }>
  prompt_tokens?: number
  completion_tokens?: number
  finish_reason?: 'stop' | 'tool_calls' | 'length'
}) {
  return {
    id: 'resp',
    choices: [
      {
        message: {
          role: 'assistant' as const,
          content: opts.content ?? null,
          tool_calls: opts.tool_calls?.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) }
          }))
        },
        finish_reason: opts.finish_reason
          ?? (opts.tool_calls && opts.tool_calls.length > 0 ? 'tool_calls' : 'stop')
      }
    ],
    usage: {
      prompt_tokens: opts.prompt_tokens ?? 100,
      completion_tokens: opts.completion_tokens ?? 20,
      total_tokens: (opts.prompt_tokens ?? 100) + (opts.completion_tokens ?? 20)
    }
  }
}

const dummyTool = {
  name: 'search',
  description: 'search',
  input_schema: { type: 'object' as const, properties: {} }
}

describe('isFuzzyResponse', () => {
  it('is fuzzy when content is empty and no tool calls', () => {
    expect(isFuzzyResponse('', false)).toBe(true)
    expect(isFuzzyResponse(null, false)).toBe(true)
    expect(isFuzzyResponse(undefined, false)).toBe(true)
    expect(isFuzzyResponse('   \n  ', false)).toBe(true)
  })

  it('is NOT fuzzy when tool calls are present (even with empty content)', () => {
    expect(isFuzzyResponse('', true)).toBe(false)
    expect(isFuzzyResponse(null, true)).toBe(false)
  })

  it('matches leaked chat-template markers', () => {
    expect(isFuzzyResponse('call:foo{skill:"x"}<tool_call|>', false)).toBe(true)
    expect(isFuzzyResponse('<|tool_call|>stuff', false)).toBe(true)
    expect(isFuzzyResponse('call:__skill__{skill:<|"|>x<|"|>}', false)).toBe(true)
    expect(isFuzzyResponse('call:search_products{query:"milk"}', false)).toBe(true)
    expect(isFuzzyResponse('<function_call name="x">...</function_call>', false)).toBe(true)
    expect(isFuzzyResponse('<tool_use>...</tool_use>', false)).toBe(true)
  })

  it('is NOT fuzzy on clean text', () => {
    expect(isFuzzyResponse('Sure, I logged the meal.', false)).toBe(false)
  })

  it('is fuzzy when finish_reason=length with no tool calls and tools were available', () => {
    expect(isFuzzyResponse('Thinking Process: I should call search...', false, {
      finishReason: 'length',
      toolsAvailable: true
    })).toBe(true)
  })

  it('is NOT fuzzy when finish_reason=length but no tools were available (plain text response truncated)', () => {
    expect(isFuzzyResponse('A long explanation that got cut', false, {
      finishReason: 'length',
      toolsAvailable: false
    })).toBe(false)
  })

  it('is NOT fuzzy when finish_reason=length alongside tool calls', () => {
    expect(isFuzzyResponse('', true, {
      finishReason: 'length',
      toolsAvailable: true
    })).toBe(false)
  })
})

describe('OpenRouterProvider fuzzy-response retries', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns successful response without retry when tool_calls are present', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ tool_calls: [{ id: 't1', name: 'foo', args: { x: 1 } }] })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.content.some(b => b.type === 'tool_use')).toBe(true)
    expect(result.stopReason).toBe('tool_use')
  })

  it('returns clean text response without retry', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'Hello, world!' })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.content).toEqual([{ type: 'text', text: 'Hello, world!' }])
  })

  it('retries on leaked tool-call template and returns the successful attempt', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({
        content: 'call:__skill__{skill:<|"|>log_meal<|"|>}<tool_call|>',
        prompt_tokens: 100,
        completion_tokens: 30
      })
    ))
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({
        tool_calls: [{ id: 't1', name: '__skill__', args: { skill: 'log_meal' } }],
        prompt_tokens: 100,
        completion_tokens: 15
      })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.stopReason).toBe('tool_use')
    // Tokens from both attempts are aggregated
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 45 })
    // Fuzzy content from first attempt does NOT leak into returned content
    const joined = result.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    expect(joined).not.toContain('<tool_call|>')
  })

  it('retries on empty response (no content, no tool_calls)', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: '', prompt_tokens: 40, completion_tokens: 0 })
    ))
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'Got it.', prompt_tokens: 40, completion_tokens: 5 })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.content).toEqual([{ type: 'text', text: 'Got it.' }])
    expect(result.usage).toEqual({ inputTokens: 80, outputTokens: 5 })
  })

  it('throws after maxFuzzyRetries when the response stays fuzzy (default throwOnFuzzyExhaustion)', async () => {
    const fetchMock = vi.mocked(fetch)
    const fuzzy = okChoice({
      content: 'call:__skill__{skill:"x"}<tool_call|>',
      prompt_tokens: 50,
      completion_tokens: 10
    })
    fetchMock.mockImplementation(async () => jsonResponse(fuzzy))

    const provider = new OpenRouterProvider({ apiKey: 'k', maxFuzzyRetries: 2 })
    await expect(
      provider.chat('sys', [{ role: 'user', content: 'hi' }], [])
    ).rejects.toThrow(/broken response after 3 attempt/)

    // 1 initial + 2 retries = 3 attempts before giving up
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns the last fuzzy response as-is when throwOnFuzzyExhaustion is false', async () => {
    const fetchMock = vi.mocked(fetch)
    const fuzzy = okChoice({
      content: 'call:__skill__{skill:"x"}<tool_call|>',
      prompt_tokens: 50,
      completion_tokens: 10
    })
    fetchMock.mockImplementation(async () => jsonResponse(fuzzy))

    const provider = new OpenRouterProvider({
      apiKey: 'k',
      maxFuzzyRetries: 2,
      throwOnFuzzyExhaustion: false
    })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 30 })
    expect(result.content.some(b => b.type === 'text')).toBe(true)
  })

  it('throws immediately when maxFuzzyRetries is 0 and the first response is fuzzy', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'call:foo{x:1}<tool_call|>' })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k', maxFuzzyRetries: 0 })
    await expect(
      provider.chat('sys', [{ role: 'user', content: 'hi' }], [])
    ).rejects.toThrow(/broken response after 1 attempt/)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns fuzzy response when both maxFuzzyRetries=0 and throwOnFuzzyExhaustion=false', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'call:foo{x:1}<tool_call|>' })
    ))

    const provider = new OpenRouterProvider({
      apiKey: 'k',
      maxFuzzyRetries: 0,
      throwOnFuzzyExhaustion: false
    })
    await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries when finish_reason=length with no tool calls and tools are available', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({
        content: 'Thinking Process:\n1. Analyze...\n*Tool call:* search(...)',
        finish_reason: 'length',
        prompt_tokens: 200,
        completion_tokens: 1024
      })
    ))
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({
        tool_calls: [{ id: 't1', name: 'search', args: { q: 'pizza' } }],
        prompt_tokens: 200,
        completion_tokens: 12
      })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [dummyTool])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.stopReason).toBe('tool_use')
    // Tokens from truncated first attempt are aggregated so cost accounting stays correct
    expect(result.usage).toEqual({ inputTokens: 400, outputTokens: 1036 })
    // Truncated monologue does NOT leak into returned content
    const joined = result.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    expect(joined).not.toContain('Thinking Process')
  })

  it('does NOT retry when finish_reason=length but no tools were provided (plain text truncation is not recoverable)', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({
        content: 'A very long plain-text answer that was truncated...',
        finish_reason: 'length'
      })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.stopReason).toBe('max_tokens')
  })

  it('sets cache_control on system prompt, last user message, and last tool when explicitCacheControl=true', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(okChoice({ content: 'ok' })))

    const provider = new OpenRouterProvider({ apiKey: 'k', explicitCacheControl: true })
    await provider.chat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      [
        { name: 'a', description: 'a', input_schema: { type: 'object', properties: {} } },
        { name: 'b', description: 'b', input_schema: { type: 'object', properties: {} } }
      ]
    )

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.messages[1].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.tools[0].cache_control).toBeUndefined()
    expect(body.tools[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('forwards provider preferences when configured', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(okChoice({ content: 'ok' })))

    const provider = new OpenRouterProvider({
      apiKey: 'k',
      provider: { order: ['Ionstream'], allow_fallbacks: false }
    })
    await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.provider).toEqual({ order: ['Ionstream'], allow_fallbacks: false })
  })

  it('omits provider field when not configured', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(okChoice({ content: 'ok' })))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('provider')
  })

  it('omits cache_control entirely by default (explicitCacheControl is off)', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(okChoice({ content: 'ok' })))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    await provider.chat(
      'sys',
      [{ role: 'user', content: 'hi' }],
      [{ name: 'a', description: 'a', input_schema: { type: 'object', properties: {} } }]
    )

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(JSON.stringify(body)).not.toContain('cache_control')
  })

  it('sends identical request body on each retry attempt', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'call:foo{x:1}<tool_call|>' })
    ))
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'ok' })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k', maxFuzzyRetries: 1 })
    await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body1 = (fetchMock.mock.calls[0][1] as RequestInit).body
    const body2 = (fetchMock.mock.calls[1][1] as RequestInit).body
    expect(body1).toBe(body2)
  })

  it('strips reasoning preamble from content by default', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'thought\nHello, world!' })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k' })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(result.content).toEqual([{ type: 'text', text: 'Hello, world!' }])
  })

  it('returns raw content when sanitizeOutput is false', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'thought\nHello, world!' })
    ))

    const provider = new OpenRouterProvider({
      apiKey: 'k',
      sanitizeOutput: false
    })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(result.content).toEqual([{ type: 'text', text: 'thought\nHello, world!' }])
  })
})
