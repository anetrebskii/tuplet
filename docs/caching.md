# Prompt Caching (Claude)

Reduce costs by up to 90% with Claude's prompt caching. Cached tokens are billed at 1/10th the price of regular input tokens.

## Enabling Cache

```typescript
import { ClaudeProvider } from '@alexnetrebskii/hive-agent'

const provider = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  cache: true  // Enable caching for system prompt, tools, and history
})

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: provider
})
```

## How It Works

1. **First request**: Tokens are written to cache (`cacheCreationInputTokens`)
2. **Subsequent requests**: Tokens are read from cache (`cacheReadInputTokens`) at 1/10th cost
3. **Cache TTL**: 5 minutes (automatically extended on each hit)

Cache breakpoints are automatically placed at optimal positions:
- System prompt
- Tools definition
- Last user message

## Checking Cache Usage

```typescript
const result = await agent.run(message)

if (result.usage) {
  console.log(`Cache write: ${result.usage.cacheCreationInputTokens || 0} tokens`)
  console.log(`Cache read: ${result.usage.cacheReadInputTokens || 0} tokens`)
  console.log(`Regular input: ${result.usage.totalInputTokens} tokens`)
}
```

## Usage by Model

Cache usage is also available per-model:

```typescript
if (result.usageByModel) {
  for (const [modelId, usage] of Object.entries(result.usageByModel)) {
    console.log(`${modelId}:`)
    console.log(`  Input: ${usage.inputTokens}`)
    console.log(`  Output: ${usage.outputTokens}`)
    if (usage.cacheCreationInputTokens) {
      console.log(`  Cache write: ${usage.cacheCreationInputTokens}`)
    }
    if (usage.cacheReadInputTokens) {
      console.log(`  Cache read: ${usage.cacheReadInputTokens}`)
    }
  }
}
```

## Cost Calculation

With tracing enabled, costs account for cache pricing:

```typescript
const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: new ClaudeProvider({ apiKey: '...', cache: true }),
  trace: new ConsoleTraceProvider({ showCosts: true })
})

const result = await agent.run(message)

// Trace shows accurate costs with cache pricing
// Cache reads: $0.30 per 1M tokens (vs $3.00 for regular input)
// Cache writes: $3.75 per 1M tokens (25% premium)
console.log(`Total cost: $${result.trace?.totalCost.toFixed(4)}`)
```

## When to Use Caching

**Good for:**
- Long system prompts
- Many tools with detailed descriptions
- Multi-turn conversations (history gets cached)
- Repeated similar queries

**Less effective for:**
- Single-turn interactions
- Highly variable prompts
- Very short system prompts

## Cache Behavior

The cache is:
- **Per-API-key**: Shared across all requests with the same key
- **Content-addressed**: Same content = same cache entry
- **Auto-extending**: TTL resets on each cache hit
- **Prefix-based**: Changes to the beginning invalidate more cache

## Example: Multi-turn Savings

```typescript
// Turn 1: Cache miss, writes ~3000 tokens
const result1 = await agent.run('Hello')
// cacheCreationInputTokens: 3000, cacheReadInputTokens: 0

// Turn 2: Cache hit on system prompt + tools + turn 1
const result2 = await agent.run('Tell me more', { history: result1.history })
// cacheCreationInputTokens: 50, cacheReadInputTokens: 3000

// Turn 3: Even more cached
const result3 = await agent.run('Thanks', { history: result2.history })
// cacheCreationInputTokens: 100, cacheReadInputTokens: 3050
```

## Pricing Reference

Claude cache pricing (as of 2024):

| Model | Input | Cache Write | Cache Read |
|-------|-------|-------------|------------|
| Claude Sonnet | $3.00/1M | $3.75/1M | $0.30/1M |
| Claude Haiku | $0.25/1M | $0.30/1M | $0.03/1M |
| Claude Opus | $15.00/1M | $18.75/1M | $1.50/1M |

Cache read is **10x cheaper** than regular input.
