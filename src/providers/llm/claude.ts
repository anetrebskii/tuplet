/**
 * Claude LLM Provider
 *
 * Implementation of LLMProvider for Anthropic's Claude API.
 */

import type {
  LLMProvider,
  LLMResponse,
  LLMOptions,
  Message,
  ToolSchema,
  ContentBlock,
  StopReason
} from '../../types.js'

export interface ClaudeProviderConfig {
  apiKey?: string
  model?: string
  maxTokens?: number
  baseURL?: string
}

interface AnthropicTextBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface AnthropicThinkingBlock {
  type: 'thinking'
  thinking: string
}

type AnthropicResponseBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicThinkingBlock

interface AnthropicContentBlockParam {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
  is_error?: boolean
  thinking?: string
  cache_control?: { type: 'ephemeral' }
}

interface AnthropicMessageParam {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlockParam[]
}

interface AnthropicTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
  cache_control?: { type: 'ephemeral' }
}

interface AnthropicResponse {
  content: AnthropicResponseBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export class ClaudeProvider implements LLMProvider {
  readonly supportsNativeTools = true
  private apiKey: string
  private model: string
  private maxTokens: number
  private baseURL: string

  constructor(config: ClaudeProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || ''
    this.model = config.model || 'claude-sonnet-4-20250514'
    this.maxTokens = config.maxTokens || 8192
    this.baseURL = config.baseURL || 'https://api.anthropic.com'
  }

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    const anthropicMessages = this.convertMessages(messages)
    const anthropicTools = this.convertTools(tools)
    const systemContent = this.buildSystemContent(systemPrompt)

    const requestBody: Record<string, unknown> = {
      model: options.model || this.model,
      max_tokens: this.maxTokens,
      system: systemContent,
      messages: anthropicMessages
    }

    if (anthropicTools.length > 0) {
      requestBody.tools = anthropicTools
    }

    const response = await fetch(`${this.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } }
      throw new Error(`Anthropic API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json() as AnthropicResponse

    return this.convertResponse(data)
  }

  /**
   * Build system content with caching
   */
  private buildSystemContent(systemPrompt: string): AnthropicTextBlock[] {
    return [{
      type: 'text' as const,
      text: systemPrompt,
      cache_control: { type: 'ephemeral' as const }
    }]
  }

  private convertMessages(messages: Message[]): AnthropicMessageParam[] {
    // Find the last user message index for cache breakpoint
    const lastUserIndex = this.findLastUserMessageIndex(messages)

    return messages.map((msg, index) => {
      const shouldCache = index === lastUserIndex

      if (typeof msg.content === 'string') {
        if (shouldCache) {
          return {
            role: msg.role,
            content: [{
              type: 'text' as const,
              text: msg.content,
              cache_control: { type: 'ephemeral' as const }
            }]
          }
        }
        return { role: msg.role, content: msg.content }
      }

      const blocks = this.convertContentBlocks(msg.content)

      if (shouldCache && blocks.length > 0) {
        const lastBlock = blocks[blocks.length - 1]
        lastBlock.cache_control = { type: 'ephemeral' }
      }

      return { role: msg.role, content: blocks }
    })
  }

  /**
   * Find the last user message index (for cache breakpoint)
   */
  private findLastUserMessageIndex(messages: Message[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return i
      }
    }
    return -1
  }

  private convertContentBlocks(blocks: ContentBlock[]): AnthropicContentBlockParam[] {
    return blocks.map(block => {
      switch (block.type) {
        case 'text':
          return { type: 'text' as const, text: block.text }
        case 'tool_use':
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input
          }
        case 'tool_result':
          return {
            type: 'tool_result' as const,
            tool_use_id: block.tool_use_id,
            content: block.content,
            is_error: block.is_error
          }
        case 'thinking':
          return { type: 'thinking' as const, thinking: block.thinking }
        default:
          throw new Error(`Unknown content block type: ${(block as ContentBlock).type}`)
      }
    })
  }

  private convertTools(tools: ToolSchema[]): AnthropicTool[] {
    return tools.map((tool, index) => {
      const isLast = index === tools.length - 1
      const baseTool: AnthropicTool = {
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as unknown as Record<string, unknown>
      }

      if (isLast) {
        baseTool.cache_control = { type: 'ephemeral' as const }
      }

      return baseTool
    })
  }

  private convertResponse(response: AnthropicResponse): LLMResponse {
    const content: ContentBlock[] = response.content.map(block => {
      switch (block.type) {
        case 'text':
          return { type: 'text' as const, text: block.text }
        case 'tool_use':
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>
          }
        case 'thinking':
          return { type: 'thinking' as const, thinking: block.thinking }
        default:
          return { type: 'text' as const, text: '' }
      }
    })

    const stopReason: StopReason =
      response.stop_reason === 'tool_use' ? 'tool_use' :
      response.stop_reason === 'max_tokens' ? 'max_tokens' :
      'end_turn'

    const usage = response.usage
    const cacheUsage = (usage.cache_creation_input_tokens || usage.cache_read_input_tokens)
      ? {
          cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
          cacheReadInputTokens: usage.cache_read_input_tokens || 0
        }
      : undefined

    return {
      content,
      stopReason,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens
      },
      cacheUsage
    }
  }

  getModelId(): string {
    return `claude:${this.model}`
  }
}
