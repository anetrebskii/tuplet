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

import type { ModelPricing } from '../../trace/types.js'

export interface OpenRouterProviderConfig {
  apiKey?: string
  model?: string
  maxTokens?: number
  baseURL?: string
  referer?: string
  title?: string
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

export class OpenRouterProvider implements LLMProvider {
  private apiKey: string
  private model: string
  private maxTokens: number
  private baseURL: string
  private referer?: string
  private title?: string

  constructor(config: OpenRouterProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || ''
    this.model = config.model || 'anthropic/claude-sonnet-4'
    this.maxTokens = config.maxTokens || 8192
    this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1'
    this.referer = config.referer
    this.title = config.title

    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required')
    }
  }

  private isAnthropicModel(model?: string): boolean {
    return (model || this.model).startsWith('anthropic/')
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    const useCache = this.isAnthropicModel(options.model)
    const openaiMessages = this.convertMessages(systemPrompt, messages, useCache)
    const openaiTools = this.convertTools(tools)

    const requestBody: Record<string, unknown> = {
      model: options.model || this.model,
      max_tokens: this.maxTokens,
      messages: openaiMessages
    }

    if (openaiTools.length > 0) {
      requestBody.tools = openaiTools
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

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } }
      throw new Error(`OpenRouter API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json() as OpenAIResponse

    return this.convertResponse(data)
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

  private convertTools(tools: ToolSchema[]): OpenAITool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema as unknown as Record<string, unknown>
      }
    }))
  }

  private convertResponse(response: OpenAIResponse): LLMResponse {
    const choice = response.choices[0]
    const content: ContentBlock[] = []

    // Add text content if present
    if (choice.message.content) {
      content.push({
        type: 'text',
        text: choice.message.content
      })
    }

    // Convert tool calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments)
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
    let cacheUsage: CacheUsage | undefined
    if (details && (details.cached_tokens || details.cache_write_tokens)) {
      cacheUsage = {
        cacheReadInputTokens: details.cached_tokens || 0,
        cacheCreationInputTokens: details.cache_write_tokens || 0
      }
    }

    return {
      content,
      stopReason,
      usage: {
        inputTokens: response.usage.prompt_tokens,
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
