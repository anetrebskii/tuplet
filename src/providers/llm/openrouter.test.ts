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
        finish_reason: opts.tool_calls && opts.tool_calls.length > 0 ? 'tool_calls' : 'stop'
      }
    ],
    usage: {
      prompt_tokens: opts.prompt_tokens ?? 100,
      completion_tokens: opts.completion_tokens ?? 20,
      total_tokens: (opts.prompt_tokens ?? 100) + (opts.completion_tokens ?? 20)
    }
  }
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

    const provider = new OpenRouterProvider({ apiKey: 'k', cache: false })
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

    const provider = new OpenRouterProvider({ apiKey: 'k', cache: false })
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

    const provider = new OpenRouterProvider({ apiKey: 'k', cache: false })
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

    const provider = new OpenRouterProvider({ apiKey: 'k', cache: false })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.content).toEqual([{ type: 'text', text: 'Got it.' }])
    expect(result.usage).toEqual({ inputTokens: 80, outputTokens: 5 })
  })

  it('stops at maxFuzzyRetries and returns the last (still fuzzy) response', async () => {
    const fetchMock = vi.mocked(fetch)
    const fuzzy = okChoice({
      content: 'call:__skill__{skill:"x"}<tool_call|>',
      prompt_tokens: 50,
      completion_tokens: 10
    })
    fetchMock.mockImplementation(async () => jsonResponse(fuzzy))

    const provider = new OpenRouterProvider({ apiKey: 'k', cache: false, maxFuzzyRetries: 2 })
    const result = await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    // 1 initial + 2 retries = 3 attempts
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 30 })
    expect(result.content.some(b => b.type === 'text')).toBe(true)
  })

  it('does not retry when maxFuzzyRetries is 0', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'call:foo{x:1}<tool_call|>' })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k', cache: false, maxFuzzyRetries: 0 })
    await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends identical request body on each retry attempt', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'call:foo{x:1}<tool_call|>' })
    ))
    fetchMock.mockResolvedValueOnce(jsonResponse(
      okChoice({ content: 'ok' })
    ))

    const provider = new OpenRouterProvider({ apiKey: 'k', cache: false, maxFuzzyRetries: 1 })
    await provider.chat('sys', [{ role: 'user', content: 'hi' }], [])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body1 = (fetchMock.mock.calls[0][1] as RequestInit).body
    const body2 = (fetchMock.mock.calls[1][1] as RequestInit).body
    expect(body1).toBe(body2)
  })
})
