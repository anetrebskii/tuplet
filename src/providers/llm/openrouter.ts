/**
 * OpenRouter LLM Provider
 *
 * Implementation of LLMProvider for OpenRouter's API, which provides
 * access to 400+ models (Claude, GPT, Gemini, Llama, etc.) through
 * an OpenAI-compatible API gateway.
 */

import type {
  LLMProvider,
  LLMResponse,
  LLMOptions,
  Message,
  ToolSchema,
  ContentBlock,
  StopReason,
  CacheUsage
} from '../../types.js'

import { defaultSanitize } from '../../sanitize.js'
import type { ModelPricing } from '../../trace/types.js'

export interface OpenRouterProviderConfig {
  apiKey?: string
  model?: string
  maxTokens?: number
  baseURL?: string
  referer?: string
  title?: string
  cache?: boolean
  /**
   * Max retries when the model returns a fuzzy response (empty, or leaked
   * chat-template markers, etc.) — treated as a stochastic glitch. Default: 2.
   * Set to 0 to disable.
   */
  maxFuzzyRetries?: number
  /**
   * If true (default), throw an error when all fuzzy-retry attempts are
   * exhausted and the final response is still broken (empty, leaked template
   * markers, or length-truncated with no tool calls). The executor surfaces
   * this as `AgentResult.status === 'error'` with an empty `response`, so a
   * host app can render its own fallback instead of leaking the broken text.
   *
   * Set to false to preserve the pre-fix behavior of returning the last
   * fuzzy response as-is.
   */
  throwOnFuzzyExhaustion?: boolean
  /**
   * OpenRouter provider-routing preferences, forwarded verbatim as the
   * top-level `provider` field in the chat-completions body.
   *
   * Useful for pinning the request to a specific upstream when only some
   * providers of a given model support the features you need (e.g. only
   * Ionstream exposes cache-read pricing for `google/gemma-4-*`). Example:
   *
   *   { order: ['Ionstream'], allow_fallbacks: false }
   *
   * Shape is pass-through — see OpenRouter's Provider Routing docs for the
   * full list of accepted fields.
   */
  provider?: Record<string, unknown>
  /**
   * If true (default), run `defaultSanitize` on the assistant's text content
   * to strip reasoning-channel artifacts (harmony `<|channel|>` markers, bare
   * `thought`/`探` preambles, etc.) that some models emit as plain text.
   *
   * Set to false to return raw `message.content` — useful for callers that
   * want to render the reasoning stream themselves.
   */
  sanitizeOutput?: boolean
}

/**
 * Patterns that indicate the model emitted chat-template artefacts as plain
 * text instead of a clean response (observed mostly on Gemma-family models).
 */
const FUZZY_CONTENT_PATTERNS: RegExp[] = [
  /<\|?tool_call\|?>/i,
  /<\|"\|>/,
  /^\s*call\s*:\s*\w+\s*\{/,
  /<function_call\b/i,
  /<tool_use\b/i,
]

/**
 * A response is "fuzzy" if it has no tool calls AND one of:
 *   - the text is empty / whitespace-only
 *   - the text contains leaked chat-template markers (Gemma-family artefact)
 *   - the response hit `max_tokens` while tools were available (model emitted
 *     chain-of-thought as plain text until truncation instead of calling a
 *     tool, observed on weaker tool-calling models like gemma-4-26b)
 *
 * From the caller's perspective this is just a broken response that should be
 * retried.
 */
export function isFuzzyResponse(
  content: string | null | undefined,
  hasToolCalls: boolean,
  opts?: { finishReason?: string; toolsAvailable?: boolean }
): boolean {
  if (hasToolCalls) return false
  if (opts?.finishReason === 'length' && opts.toolsAvailable) return true
  if (!content || !content.trim()) return true
  return FUZZY_CONTENT_PATTERNS.some(re => re.test(content))
}

interface OpenAIContentPart {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OpenAIContentPart[] | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
  cache_control?: { type: 'ephemeral' }
}

interface OpenAIResponse {
  id: string
  choices: Array<{
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: OpenAIToolCall[]
    }
    finish_reason: 'stop' | 'tool_calls' | 'length'
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens?: number
      cache_write_tokens?: number
    }
  }
}

/**
 * Model prefixes that reliably handle tool descriptions from the API tools parameter,
 * making system prompt tool listings redundant. Other models may support tool calling
 * but still benefit from having tool descriptions in the system prompt.
 */
const NATIVE_TOOL_PREFIXES = [
  'anthropic/',
  'openai/',
]

function modelSupportsNativeTools(model: string): boolean {
  return NATIVE_TOOL_PREFIXES.some(p => model.startsWith(p))
}

export class OpenRouterProvider implements LLMProvider {
  private apiKey: string
  private model: string
  private maxTokens: number
  private baseURL: string
  private referer?: string
  private title?: string
  private cache: boolean
  private maxFuzzyRetries: number
  private throwOnFuzzyExhaustion: boolean
  private providerPreferences?: Record<string, unknown>
  private sanitizeOutput: boolean

  constructor(config: OpenRouterProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || ''
    this.model = config.model || 'anthropic/claude-sonnet-4'
    this.maxTokens = config.maxTokens || 8192
    this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1'
    this.referer = config.referer
    this.title = config.title
    this.cache = config.cache !== false
    this.maxFuzzyRetries = config.maxFuzzyRetries ?? 2
    this.throwOnFuzzyExhaustion = config.throwOnFuzzyExhaustion !== false
    this.providerPreferences = config.provider
    this.sanitizeOutput = config.sanitizeOutput !== false

    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required')
    }
  }

  get supportsNativeTools(): boolean {
    return modelSupportsNativeTools(this.model)
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    const openaiMessages = this.convertMessages(systemPrompt, messages, this.cache)
    const openaiTools = this.convertTools(tools, this.cache)

    const requestBody: Record<string, unknown> = {
      model: options.model || this.model,
      max_tokens: this.maxTokens,
      messages: openaiMessages
    }

    if (openaiTools.length > 0) {
      requestBody.tools = openaiTools
    }

    if (this.providerPreferences) {
      requestBody.provider = this.providerPreferences
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    }

    if (this.referer) {
      headers['HTTP-Referer'] = this.referer
    }

    if (this.title) {
      headers['X-Title'] = this.title
    }

    // Retry on fuzzy responses (empty content, leaked chat-template markers,
    // etc.) — stochastic model glitches that a plain retry usually fixes.
    // Tokens from failed attempts are summed into the returned usage so cost
    // accounting stays correct; only the final response is returned, so the
    // fuzzy text can never leak into chat history.
    const maxAttempts = 1 + Math.max(0, this.maxFuzzyRetries)
    let lastData: OpenAIResponse | undefined
    let lastFuzzy = true
    let totalInput = 0
    let totalOutput = 0
    let totalCacheRead = 0
    let totalCacheWrite = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const data = await this.requestOnce(requestBody, headers)
      lastData = data

      const details = data.usage.prompt_tokens_details
      const cachedRead = details?.cached_tokens || 0
      const cacheWrite = details?.cache_write_tokens || 0
      totalInput += data.usage.prompt_tokens - cachedRead - cacheWrite
      totalOutput += data.usage.completion_tokens
      totalCacheRead += cachedRead
      totalCacheWrite += cacheWrite

      const choice = data.choices[0]
      const hasToolCalls = (choice.message.tool_calls ?? []).length > 0
      const toolsAvailable = openaiTools.length > 0
      if (!isFuzzyResponse(choice.message.content, hasToolCalls, {
        finishReason: choice.finish_reason,
        toolsAvailable
      })) {
        lastFuzzy = false
        break
      }
    }

    if (lastFuzzy && this.throwOnFuzzyExhaustion) {
      throw new Error(
        `OpenRouter: model returned a broken response after ${maxAttempts} attempt(s) ` +
        `(empty, leaked chat-template markers, or truncated at max_tokens with no tool calls). ` +
        `Set throwOnFuzzyExhaustion: false to return the fuzzy response as-is.`
      )
    }

    const converted = this.convertResponse(lastData!)
    const cacheUsage: CacheUsage | undefined =
      totalCacheRead || totalCacheWrite
        ? { cacheReadInputTokens: totalCacheRead, cacheCreationInputTokens: totalCacheWrite }
        : undefined

    return {
      ...converted,
      usage: { inputTokens: totalInput, outputTokens: totalOutput },
      cacheUsage
    }
  }

  private async requestOnce(
    requestBody: Record<string, unknown>,
    headers: Record<string, string>
  ): Promise<OpenAIResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    // Read the body as text once so we can both parse it AND echo it in error
    // messages. OpenRouter often relays upstream failures as "Provider returned
    // error" with the real detail in `error.metadata` or `error.code` — without
    // the raw body in the thrown message, callers have no way to diagnose.
    const rawBody = await response.text()
    const data = safeParseJson(rawBody) as
      | (OpenAIResponse & { error?: { message?: string; code?: number; metadata?: unknown } })
      | null

    if (!response.ok) {
      const upstream = data?.error?.message || response.statusText
      throw new Error(
        `OpenRouter API error (HTTP ${response.status}): ${upstream} — ` +
        `body: ${truncate(rawBody, 500)}`
      )
    }

    if (!data) {
      throw new Error(
        `OpenRouter API error: response was not valid JSON — ` +
        `body: ${truncate(rawBody, 500)}`
      )
    }

    // OpenRouter can return 200 OK with an error body (e.g. provider timeout).
    // Include the full error object since `.message` is often a generic
    // placeholder ("Provider returned error") while the real detail lives in
    // `.code` or `.metadata`.
    if (data.error) {
      throw new Error(
        `OpenRouter API error: ${data.error.message || 'provider returned an error'} — ` +
        `detail: ${truncate(JSON.stringify(data.error), 500)}`
      )
    }

    if (!data.choices?.[0]?.message) {
      throw new Error(
        `OpenRouter API error: empty response (no choices returned) — ` +
        `body: ${truncate(rawBody, 500)}`
      )
    }

    return data
  }

  private convertMessages(systemPrompt: string, messages: Message[], useCache: boolean): OpenAIMessage[] {
    // System message: use cache_control array format for Anthropic models
    const systemMessage: OpenAIMessage = useCache
      ? {
          role: 'system',
          content: [{
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const }
          }]
        }
      : { role: 'system', content: systemPrompt }

    const result: OpenAIMessage[] = [systemMessage]

    // Find last user message index for cache breakpoint
    const lastUserIndex = useCache ? this.findLastUserMessageIndex(messages) : -1

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const shouldCache = i === lastUserIndex

      if (typeof msg.content === 'string') {
        if (shouldCache) {
          result.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: [{
              type: 'text' as const,
              text: msg.content,
              cache_control: { type: 'ephemeral' as const }
            }]
          })
        } else {
          result.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          })
        }
      } else {
        // Handle content blocks
        const converted = this.convertContentBlocksToOpenAI(msg.content, msg.role)
        if (shouldCache && converted.length > 0) {
          const last = converted[converted.length - 1]
          // Add cache_control to the last message's content
          if (typeof last.content === 'string' && last.content) {
            last.content = [{
              type: 'text' as const,
              text: last.content,
              cache_control: { type: 'ephemeral' as const }
            }]
          }
        }
        result.push(...converted)
      }
    }

    return result
  }

  private findLastUserMessageIndex(messages: Message[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i
    }
    return -1
  }

  private convertContentBlocksToOpenAI(blocks: ContentBlock[], role: 'user' | 'assistant'): OpenAIMessage[] {
    const messages: OpenAIMessage[] = []

    // Separate tool results from other content
    const toolResults = blocks.filter(b => b.type === 'tool_result')
    const otherBlocks = blocks.filter(b => b.type !== 'tool_result')

    // Handle assistant messages with tool_use
    if (role === 'assistant') {
      const toolUseBlocks = otherBlocks.filter(b => b.type === 'tool_use')
      const textBlocks = otherBlocks.filter(b => b.type === 'text')

      const textContent = textBlocks.map(b => (b as { text: string }).text).join('\n')

      if (toolUseBlocks.length > 0) {
        const toolCalls: OpenAIToolCall[] = toolUseBlocks.map(block => {
          const tu = block as { id: string; name: string; input: Record<string, unknown> }
          return {
            id: tu.id,
            type: 'function' as const,
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input)
            }
          }
        })

        messages.push({
          role: 'assistant',
          content: textContent || null,
          tool_calls: toolCalls
        })
      } else if (textContent) {
        messages.push({
          role: 'assistant',
          content: textContent
        })
      }
    }

    // Handle tool results (these become separate 'tool' role messages)
    for (const tr of toolResults) {
      const toolResult = tr as { tool_use_id: string; content: string }
      messages.push({
        role: 'tool',
        content: toolResult.content,
        tool_call_id: toolResult.tool_use_id
      })
    }

    // Handle user text messages
    if (role === 'user' && toolResults.length === 0) {
      const textBlocks = otherBlocks.filter(b => b.type === 'text')
      const textContent = textBlocks.map(b => (b as { text: string }).text).join('\n')

      if (textContent) {
        messages.push({
          role: 'user',
          content: textContent
        })
      }
    }

    return messages
  }

  private convertTools(tools: ToolSchema[], useCache: boolean): OpenAITool[] {
    return tools.map((tool, index) => {
      const isLast = index === tools.length - 1
      const converted: OpenAITool = {
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema as unknown as Record<string, unknown>
        }
      }

      if (useCache && isLast) {
        converted.cache_control = { type: 'ephemeral' as const }
      }

      return converted
    })
  }

  private convertResponse(response: OpenAIResponse): LLMResponse {
    const choice = response.choices[0]
    const content: ContentBlock[] = []

    // Strip reasoning-channel artifacts (harmony `<|channel|>` markers, leading
    // `thought\n`) that some OpenRouter models emit as plain text in content.
    // Opt-out via `sanitizeOutput: false` on the provider config.
    if (choice.message.content) {
      const cleaned = this.sanitizeOutput
        ? defaultSanitize(choice.message.content)
        : choice.message.content
      if (cleaned.length > 0) {
        content.push({ type: 'text', text: cleaned })
      }
    }

    // Convert tool calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
        })
      }
    }

    // Determine stop reason
    let stopReason: StopReason = 'end_turn'
    if (choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use'
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens'
    }

    // Extract cache usage if present (Anthropic models via OpenRouter)
    const details = response.usage.prompt_tokens_details
    const cachedRead = details?.cached_tokens || 0
    const cacheWrite = details?.cache_write_tokens || 0
    let cacheUsage: CacheUsage | undefined
    if (cachedRead || cacheWrite) {
      cacheUsage = {
        cacheReadInputTokens: cachedRead,
        cacheCreationInputTokens: cacheWrite
      }
    }

    // OpenRouter reports prompt_tokens as total (including cached tokens),
    // but calculateCost expects inputTokens to exclude cache tokens
    // (matching Anthropic's native API convention where input_tokens
    // excludes both cache_read and cache_creation tokens).
    const inputTokens = response.usage.prompt_tokens - cachedRead - cacheWrite

    return {
      content,
      stopReason,
      usage: {
        inputTokens,
        outputTokens: response.usage.completion_tokens
      },
      cacheUsage
    }
  }

  getModelId(): string {
    return `openrouter:${this.model}`
  }

  /**
   * Fetch live model pricing from OpenRouter's public API.
   * Returns a Record<string, ModelPricing> keyed by "openrouter:{modelId}"
   * that can be passed to ConsoleTraceProvider({ modelPricing }).
   *
   * The endpoint is public and requires no API key.
   */
  static async fetchModelPricing(
    baseURL = 'https://openrouter.ai/api/v1'
  ): Promise<Record<string, ModelPricing>> {
    const response = await fetch(`${baseURL}/models`)

    if (!response.ok) {
      throw new Error(`OpenRouter models API error: ${response.statusText}`)
    }

    const data = await response.json() as OpenRouterModelsResponse
    const pricing: Record<string, ModelPricing> = {}

    for (const model of data.data) {
      const p = model.pricing
      if (!p?.prompt || !p?.completion) continue

      const inputPer1M = parseFloat(p.prompt) * 1_000_000
      const outputPer1M = parseFloat(p.completion) * 1_000_000
      if (inputPer1M === 0 && outputPer1M === 0) continue

      const entry: ModelPricing = { inputPer1M, outputPer1M }

      if (p.input_cache_write) {
        const val = parseFloat(p.input_cache_write) * 1_000_000
        if (val > 0) entry.cacheWritePer1M = val
      }
      if (p.input_cache_read) {
        const val = parseFloat(p.input_cache_read) * 1_000_000
        if (val > 0) entry.cacheReadPer1M = val
      }

      pricing[`openrouter:${model.id}`] = entry
    }

    return pricing
  }
}

interface OpenRouterModelsResponse {
  data: Array<{
    id: string
    pricing?: {
      prompt?: string
      completion?: string
      input_cache_read?: string
      input_cache_write?: string
    }
  }>
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…(+${s.length - max} chars)`
}
