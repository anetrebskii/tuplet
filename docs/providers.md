# LLM Providers

Hive supports multiple LLM providers out of the box.

## Claude (Anthropic)

```typescript
import { ClaudeProvider } from '@alexnetrebskii/hive-agent'

const provider = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514',  // Default
  maxTokens: 8192,
  cache: true  // Enable prompt caching
})

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: provider
})
```

### Claude Configuration

```typescript
interface ClaudeProviderConfig {
  apiKey: string
  model?: string        // Default: 'claude-sonnet-4-20250514'
  maxTokens?: number    // Default: 8192
  cache?: boolean       // Enable prompt caching (default: false)
}
```

### Available Models

- `claude-opus-4-5-20251101` - Most capable
- `claude-sonnet-4-20250514` - Balanced (default)
- `claude-3-haiku-20240307` - Fast and cheap

## OpenAI

```typescript
import { OpenAIProvider } from '@alexnetrebskii/hive-agent'

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',  // Default
  maxTokens: 4096
})

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: provider
})
```

### OpenAI Configuration

```typescript
interface OpenAIProviderConfig {
  apiKey: string
  model?: string        // Default: 'gpt-4o'
  maxTokens?: number    // Default: 4096
  baseURL?: string      // For proxies or Azure
}
```

### Available Models

- `gpt-4o` - Most capable (default)
- `gpt-4o-mini` - Fast and cheap
- `gpt-4-turbo` - Previous generation

### Using Azure OpenAI

```typescript
const provider = new OpenAIProvider({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment',
  model: 'gpt-4o'
})
```

## Custom Provider

Implement the `LLMProvider` interface:

```typescript
import type { LLMProvider, LLMResponse, Message, ToolSchema, LLMOptions } from '@alexnetrebskii/hive-agent'

class CustomProvider implements LLMProvider {
  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    // Call your LLM API
    const response = await yourApi.chat({
      system: systemPrompt,
      messages,
      tools,
      model: options?.model
    })

    return {
      content: [{ type: 'text', text: response.text }],
      stopReason: response.finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: {
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens
      }
    }
  }

  getModelId(): string {
    return 'custom:my-model'
  }
}
```

### LLMProvider Interface

```typescript
interface LLMProvider {
  chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options?: LLMOptions
  ): Promise<LLMResponse>

  getModelId?(): string  // For usage tracking
}

interface LLMResponse {
  content: ContentBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  cacheUsage?: {
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  }
}

interface LLMOptions {
  thinkingMode?: 'none' | 'enabled'
  thinkingBudget?: number
  model?: string
}
```

## Mixed Providers

Use different providers for main agent and sub-agents:

```typescript
const claude = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514'
})

const openai = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini'
})

const fastHelper: SubAgentConfig = {
  name: 'fast_helper',
  description: 'Quick tasks',
  systemPrompt: '...',
  tools: [...],
  llm: openai  // Uses GPT-4o-mini
}

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  agents: [fastHelper],
  llm: claude  // Main agent uses Claude
})
```

## Model Override

Override model per-request or per-agent:

```typescript
// Per sub-agent
const researchAgent: SubAgentConfig = {
  name: 'researcher',
  description: '...',
  systemPrompt: '...',
  tools: [...],
  model: 'claude-3-haiku-20240307'  // Override just the model
}

// The agent will use parent's provider but with different model
```

## Logging Provider

For debugging, wrap a provider:

```typescript
class LoggingProvider implements LLMProvider {
  constructor(private inner: LLMProvider) {}

  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    console.log('Request:', { messageCount: messages.length, toolCount: tools.length })

    const start = Date.now()
    const response = await this.inner.chat(systemPrompt, messages, tools, options)
    const duration = Date.now() - start

    console.log('Response:', {
      duration,
      stopReason: response.stopReason,
      usage: response.usage
    })

    return response
  }

  getModelId(): string {
    return this.inner.getModelId?.() || 'unknown'
  }
}

const provider = new LoggingProvider(new ClaudeProvider({ apiKey: '...' }))
```
