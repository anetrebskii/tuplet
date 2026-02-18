# LLM Providers

All providers use prompt caching automatucally to reduce costs by up to 90%.

## Claude (Anthropic)

```typescript
import { ClaudeProvider } from 'tuplet'

const provider = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514',  // default
  maxTokens: 8192,                    // default
})
```

## OpenAI

```typescript
import { OpenAIProvider } from 'tuplet'

const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',       // default
  maxTokens: 4096,        // default
  baseURL: '...'          // optional, for Azure, OpenRouter, or proxies
})
```

## OpenRouter

Any OpenAI-compatible provider works via `baseURL`. For example, [OpenRouter](https://openrouter.ai) gives access to hundreds of models through a single API:

```typescript
const provider = new OpenAIProvider({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
})
```

## Mixed Providers

Main agent and [sub-agents](./sub-agents.md) can use different providers:

```typescript
const agent = new Tuplet({
  role: '...',
  agents: [{
    name: 'fast_helper',
    description: 'Quick tasks',
    systemPrompt: '...',
    tools: [...],
    llm: new OpenAIProvider({ apiKey: '...', model: 'gpt-4o-mini' })
  }],
  llm: new ClaudeProvider({ apiKey: '...' })
})
```

## Custom Provider

Implement `LLMProvider` to use any LLM:

```typescript
import type { LLMProvider, LLMResponse, Message, ToolSchema, LLMOptions } from 'tuplet'

class CustomProvider implements LLMProvider {
  async chat(
    systemPrompt: string,
    messages: Message[],
    tools: ToolSchema[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    const response = await yourApi.chat({ system: systemPrompt, messages, tools })

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
