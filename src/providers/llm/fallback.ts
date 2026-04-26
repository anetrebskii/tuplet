/**
 * Fallback LLM Provider
 *
 * Wraps an ordered list of LLMProviders. On chat(), tries each provider in
 * order and falls back to the next one if the current one throws. Useful for
 * surviving transient upstream outages or rate limits by routing the same
 * request to a different vendor.
 */

import type {
  LLMProvider,
  LLMResponse,
  LLMOptions,
  Message,
  ToolSchema
} from '../../types.js'

/**
 * Strict policy that recognizes only network/upstream issues — HTTP 5xx,
 * 408, 429, native socket errors, OpenRouter relays of upstream failures —
 * and rejects HTTP 4xx (auth/validation) plus AbortError.
 *
 * NOT used by default. The default {@link FallbackProvider} policy is more
 * permissive (fall back on anything except AbortError) because chain members
 * usually have *different* model ids, so an HTTP 400 like "invalid model ID"
 * on the primary is exactly the kind of error a backup can recover from.
 *
 * Pass this as `shouldFallback` if you'd rather only retry on classic
 * transient outages and surface caller bugs immediately:
 *
 *     new FallbackProvider({ providers, shouldFallback: isTransientError })
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false

  if (error instanceof Error && error.name === 'AbortError') return false

  const message = error instanceof Error ? error.message : String(error)

  // HTTP status extracted from the thrown message. Providers shaped like
  // OpenRouter put it as `HTTP 503` in the error string.
  const httpMatch = message.match(/HTTP\s+(\d{3})/i)
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10)
    if (status >= 500 && status < 600) return true
    if (status === 408 || status === 429) return true
    if (status >= 400 && status < 500) return false
  }

  // Native undici/fetch errors carry the syscall code on `.cause`.
  const cause = (error as { cause?: { code?: string } } | null)?.cause
  if (cause?.code) {
    const transient = new Set([
      'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN',
      'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ENOTFOUND',
      'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'
    ])
    if (transient.has(cause.code)) return true
  }

  // Default: anything not classified as a clear caller bug is transient.
  return true
}

/**
 * Default policy: fall back on every thrown error EXCEPT a user-triggered
 * cancellation (AbortError). The intent of a fallback chain is "if my
 * primary can't serve this, try the next one", and most 4xx errors are
 * per-provider in practice — `invalid model ID`, `model not found`, an
 * upstream backend that rejects a tool schema another backend accepts, etc.
 *
 * Cost-of-caller-bug: a genuinely broken request (e.g. malformed schema
 * shared by every chain member) costs N calls instead of 1. That's the
 * deliberate tradeoff for resilience. Callers who'd rather fail closed on
 * 4xx errors should pass {@link isTransientError} as `shouldFallback`.
 */
function defaultShouldFallback(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return false
  return true
}

export interface FallbackProviderConfig {
  /**
   * Ordered list of providers. The first is the primary; each subsequent
   * one is tried only if the previous attempt throws an error matched by
   * the fallback policy.
   */
  providers: LLMProvider[]
  /**
   * Override the default policy ({@link defaultShouldFallback} — fall back
   * on everything except AbortError). Return false to re-throw immediately.
   * Pass {@link isTransientError} for the stricter network-only policy.
   */
  shouldFallback?: (error: unknown, providerIndex: number) => boolean
  /**
   * Optional hook fired right before falling back from one provider to the
   * next. Receives the triggering error plus the indices of the failing and
   * next provider in the list. Useful for logging.
   */
  onFallback?: (error: unknown, fromIndex: number, toIndex: number) => void
}

export class FallbackProvider implements LLMProvider {
  private providers: LLMProvider[]
  private shouldFallback: (error: unknown, providerIndex: number) => boolean
  private onFallback?: (error: unknown, fromIndex: number, toIndex: number) => void

  constructor(config: FallbackProviderConfig) {
    if (!config.providers || config.providers.length === 0) {
      throw new Error('FallbackProvider requires at least one provider')
    }
    this.providers = config.providers
    this.shouldFallback = config.shouldFallback ?? defaultShouldFallback
    this.onFallback = config.onFallback
  }

  // Inherit native-tool support from the primary. The system prompt is built
  // once per turn against this flag, so the chain only works if every member
  // agrees on whether tools live in the prompt or in the API tools parameter.
  get supportsNativeTools(): boolean {
    return this.providers[0].supportsNativeTools === true
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    let lastError: unknown
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]
      try {
        const response = await provider.chat(systemPrompt, messages, tools, options)
        // Stamp the actual serving model on the response so the executor
        // attributes tokens and cost to the provider that handled this call,
        // not the chain's primary.
        return {
          ...response,
          modelId: response.modelId ?? provider.getModelId?.() ?? this.getModelId()
        }
      } catch (error) {
        lastError = error
        const isLast = i === this.providers.length - 1
        if (isLast || !this.shouldFallback(error, i)) {
          throw error
        }
        this.onFallback?.(error, i, i + 1)
      }
    }
    throw lastError
  }

  // Default model id used when no call has happened yet (e.g. for an
  // executor-level "expected model" snapshot). Per-call cost accounting comes
  // from `LLMResponse.modelId`, populated above.
  getModelId(): string {
    return this.providers[0].getModelId?.() ?? 'fallback'
  }
}
