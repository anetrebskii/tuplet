import { describe, it, expect, vi } from 'vitest'
import { FallbackProvider, isTransientError } from './fallback.js'
import type { LLMProvider, LLMResponse } from '../../types.js'

function stubProvider(opts: {
  modelId?: string
  supportsNativeTools?: boolean
  chat: () => Promise<LLMResponse>
}): LLMProvider {
  return {
    chat: opts.chat,
    getModelId: () => opts.modelId ?? 'stub:stub',
    supportsNativeTools: opts.supportsNativeTools
  }
}

const okResponse: LLMResponse = {
  content: [{ type: 'text', text: 'ok' }],
  stopReason: 'end_turn',
  usage: { inputTokens: 1, outputTokens: 1 }
}

describe('FallbackProvider', () => {
  it('returns the primary response when it succeeds', async () => {
    const primary = stubProvider({ chat: vi.fn().mockResolvedValue(okResponse) })
    const backup = stubProvider({ chat: vi.fn() })

    const provider = new FallbackProvider({ providers: [primary, backup] })
    const result = await provider.chat('sys', [], [])

    expect(result.content).toEqual(okResponse.content)
    expect(result.stopReason).toBe(okResponse.stopReason)
    expect(primary.chat).toHaveBeenCalledTimes(1)
    expect(backup.chat).not.toHaveBeenCalled()
  })

  it('falls through to the next provider on a transient error', async () => {
    const error = new Error('OpenRouter API error (HTTP 503): upstream timeout')
    const primary = stubProvider({
      modelId: 'claude:sonnet',
      chat: vi.fn().mockRejectedValue(error)
    })
    const backup = stubProvider({
      modelId: 'openrouter:anthropic/claude-sonnet-4',
      chat: vi.fn().mockResolvedValue(okResponse)
    })
    const onFallback = vi.fn()

    const provider = new FallbackProvider({
      providers: [primary, backup],
      onFallback
    })
    const result = await provider.chat('sys', [], [])

    // Cost attribution must follow the provider that actually served the
    // call — the executor reads `response.modelId` per call.
    expect(result.modelId).toBe('openrouter:anthropic/claude-sonnet-4')
    expect(result.content).toEqual(okResponse.content)
    expect(primary.chat).toHaveBeenCalledTimes(1)
    expect(backup.chat).toHaveBeenCalledTimes(1)
    expect(onFallback).toHaveBeenCalledWith(error, 0, 1)
  })

  it('stamps the primary model id on the response when the primary succeeds', async () => {
    const primary = stubProvider({
      modelId: 'claude:sonnet',
      chat: vi.fn().mockResolvedValue(okResponse)
    })
    const backup = stubProvider({ chat: vi.fn() })

    const provider = new FallbackProvider({ providers: [primary, backup] })
    const result = await provider.chat('sys', [], [])

    expect(result.modelId).toBe('claude:sonnet')
  })

  it('preserves a model id already set by the inner provider', async () => {
    const inner: LLMResponse = { ...okResponse, modelId: 'router:auto-picked-model' }
    const primary = stubProvider({
      modelId: 'router:default',
      chat: vi.fn().mockResolvedValue(inner)
    })

    const provider = new FallbackProvider({ providers: [primary] })
    const result = await provider.chat('sys', [], [])

    expect(result.modelId).toBe('router:auto-picked-model')
  })

  it('throws the last error when every provider fails', async () => {
    const first = new Error('OpenRouter API error (HTTP 503): first down')
    const second = new Error('OpenRouter API error (HTTP 503): second down')
    const primary = stubProvider({ chat: vi.fn().mockRejectedValue(first) })
    const backup = stubProvider({ chat: vi.fn().mockRejectedValue(second) })

    const provider = new FallbackProvider({ providers: [primary, backup] })

    await expect(provider.chat('sys', [], [])).rejects.toBe(second)
  })

  it('honors shouldFallback to short-circuit on non-retryable errors', async () => {
    const error = new Error('400 bad request')
    const primary = stubProvider({ chat: vi.fn().mockRejectedValue(error) })
    const backup = stubProvider({ chat: vi.fn() })

    const provider = new FallbackProvider({
      providers: [primary, backup],
      shouldFallback: () => false
    })

    await expect(provider.chat('sys', [], [])).rejects.toBe(error)
    expect(backup.chat).not.toHaveBeenCalled()
  })

  it('rejects an empty providers list', () => {
    expect(() => new FallbackProvider({ providers: [] })).toThrow(/at least one/)
  })

  it('does NOT fall back on a 4xx error by default (caller bug, not transient)', async () => {
    const error = new Error('OpenRouter API error (HTTP 401): Invalid API key')
    const primary = stubProvider({ chat: vi.fn().mockRejectedValue(error) })
    const backup = stubProvider({ chat: vi.fn() })

    const provider = new FallbackProvider({ providers: [primary, backup] })

    await expect(provider.chat('sys', [], [])).rejects.toBe(error)
    expect(backup.chat).not.toHaveBeenCalled()
  })

  it('falls back on a native fetch ECONNRESET by default', async () => {
    const error = new TypeError('fetch failed')
    ;(error as { cause?: unknown }).cause = { code: 'ECONNRESET' }
    const primary = stubProvider({ chat: vi.fn().mockRejectedValue(error) })
    const backup = stubProvider({ chat: vi.fn().mockResolvedValue(okResponse) })

    const provider = new FallbackProvider({ providers: [primary, backup] })
    const result = await provider.chat('sys', [], [])

    expect(result.content).toEqual(okResponse.content)
    expect(backup.chat).toHaveBeenCalledTimes(1)
  })

  it('does NOT fall back on AbortError (user cancelled the run)', async () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const primary = stubProvider({ chat: vi.fn().mockRejectedValue(error) })
    const backup = stubProvider({ chat: vi.fn() })

    const provider = new FallbackProvider({ providers: [primary, backup] })

    await expect(provider.chat('sys', [], [])).rejects.toBe(error)
    expect(backup.chat).not.toHaveBeenCalled()
  })

  it('reports the primary model id and native-tool support', () => {
    const primary = stubProvider({
      chat: vi.fn(),
      modelId: 'openrouter:anthropic/claude-sonnet-4',
      supportsNativeTools: true
    })
    const backup = stubProvider({
      chat: vi.fn(),
      modelId: 'openrouter:google/gemini-2.5',
      supportsNativeTools: false
    })

    const provider = new FallbackProvider({ providers: [primary, backup] })
    expect(provider.getModelId()).toBe('openrouter:anthropic/claude-sonnet-4')
    expect(provider.supportsNativeTools).toBe(true)
  })
})

describe('isTransientError', () => {
  it.each([
    ['HTTP 500 server error', 'OpenRouter API error (HTTP 500): boom'],
    ['HTTP 503 upstream', 'OpenRouter API error (HTTP 503): upstream'],
    ['HTTP 408 timeout', 'API error (HTTP 408): timeout'],
    ['HTTP 429 rate limit', 'API error (HTTP 429): rate limit'],
    ['fuzzy exhaustion', 'OpenRouter: model returned a broken response after 3 attempt(s)'],
    ['provider relay', 'OpenRouter API error: provider returned an error']
  ])('returns true for %s', (_, message) => {
    expect(isTransientError(new Error(message))).toBe(true)
  })

  it.each([
    ['HTTP 400', 'API error (HTTP 400): bad request'],
    ['HTTP 401', 'API error (HTTP 401): invalid key'],
    ['HTTP 403', 'API error (HTTP 403): forbidden'],
    ['HTTP 404', 'API error (HTTP 404): unknown model']
  ])('returns false for %s', (_, message) => {
    expect(isTransientError(new Error(message))).toBe(false)
  })

  it('returns false for AbortError', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(isTransientError(err)).toBe(false)
  })

  it('recognizes native fetch ECONNRESET via .cause.code', () => {
    const err = new TypeError('fetch failed')
    ;(err as { cause?: unknown }).cause = { code: 'ECONNRESET' }
    expect(isTransientError(err)).toBe(true)
  })
})
