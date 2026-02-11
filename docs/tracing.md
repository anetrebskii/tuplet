# Tracing

See exactly what your agent is doing — every LLM call, tool invocation, and sub-agent spawn — with token usage and cost breakdown. Useful for debugging agent behavior, optimizing prompt costs, and monitoring production workloads.

There are two ways to consume trace data:

- **`ConsoleTraceProvider`** — prints a real-time execution tree to the console as the agent runs. Best for development and debugging.
- **`result.trace`** — returns trace data programmatically after the run completes. Best for storing costs, displaying progress in a UI, or analytics.

You can use both at the same time.

## ConsoleTraceProvider

Prints a real-time execution tree to the console as the agent runs — useful during development:

```typescript
import { Hive, ClaudeProvider, ConsoleTraceProvider } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  systemPrompt: '...',
  agents: [...],
  llm: new ClaudeProvider({ apiKey: '...' }),
  trace: new ConsoleTraceProvider({ showCosts: true }),
  agentName: 'my_agent'
})

const result = await agent.run('Do something complex')
```

```text
━━━ Trace: trace_1704067200000_abc123 ━━━
🤖 my_agent started
   ↳ Do something complex
  ⚡ my_agent → LLM: claude-sonnet-4-20250514 (1250/89 tokens, 850ms, $0.004200)
  🔧 my_agent → search_food ✓ (125ms)
  🔹 my_agent → nutrition_counter started
     ↳ Task parameters: { "food": "chicken", "portionGrams": 200 }
    ⚡ my_agent → nutrition_counter → LLM: claude-haiku-4-5-20251001 (800/45 tokens, 320ms, $0.000300)
    🔧 my_agent → nutrition_counter → log_meal ✓ (52ms)
  ✓ my_agent → nutrition_counter completed (520ms, $0.000300)
     ↳ Logged 200g chicken for lunch: 330 kcal
✓ my_agent completed (2300ms, $0.004500)
   ↳ I've logged your chicken. That's 330 calories with 62g protein.

━━━ Trace Complete ━━━
Duration: 2300ms
Total LLM calls: 2
Total tool calls: 2
Total tokens: 2050 in / 134 out [cache: +0 write, 650 read]
Total cost: $0.004500
```

### Options

```typescript
new ConsoleTraceProvider({
  showLLMCalls: true,        // Show LLM calls (default: true)
  showToolCalls: true,       // Show tool calls (default: true)
  showCosts: true,           // Show cost per call (default: true)
  showMessages: true,        // Show input/output previews (default: true)
  maxMessageLength: 80,      // Max preview length (default: 80)
  colors: true,              // Use ANSI colors (default: true)
  modelPricing: { ... }      // Override default pricing (see below)
})
```

## Accessing Trace Data

Regardless of the provider, `result.trace` gives you trace data programmatically after the run — useful for storing costs in a database, displaying in a UI, or analytics:

```typescript
const result = await agent.run(message)

if (result.trace) {
  console.log(`Cost: $${result.trace.totalCost.toFixed(4)}`)
  console.log(`Duration: ${result.trace.durationMs}ms`)
  console.log(`LLM calls: ${result.trace.totalLLMCalls}`)
  console.log(`Tool calls: ${result.trace.totalToolCalls}`)

  // Cost breakdown by model
  for (const [modelId, usage] of Object.entries(result.trace.costByModel)) {
    console.log(`${modelId}: ${usage.calls} calls, $${usage.cost.toFixed(6)}`)
  }
}
```

## Custom Model Pricing

Override default pricing for cost calculation:

```typescript
new ConsoleTraceProvider({
  showCosts: true,
  modelPricing: {
    'claude-sonnet-4-20250514': {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheWritePer1M: 3.75,
      cacheReadPer1M: 0.30
    },
    'gpt-4o': {
      inputPer1M: 2.5,
      outputPer1M: 10.0
    }
  }
})
```

## Custom Trace Provider

Implement `TraceProvider` to send traces to a database, observability platform, or any other system:

```typescript
import type { TraceProvider, Trace, AgentSpan, LLMCallEvent, ToolCallEvent } from '@alexnetrebskii/hive-agent'

interface TraceProvider {
  onTraceStart(trace: Trace): void
  onTraceEnd(trace: Trace): void
  onAgentStart(span: AgentSpan, trace: Trace): void
  onAgentEnd(span: AgentSpan, trace: Trace): void
  onLLMCall(event: LLMCallEvent, span: AgentSpan, trace: Trace): void
  onToolCall(event: ToolCallEvent, span: AgentSpan, trace: Trace): void
  modelPricing?: Record<string, ModelPricing>
}
```
