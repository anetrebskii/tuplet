# Tracing

See exactly what your agent is doing — every LLM call, tool invocation, and sub-agent spawn — with token usage and cost breakdown. Useful for debugging agent behavior, optimizing prompt costs, and monitoring production workloads.

Built-in providers:

- **`ConsoleTraceProvider`** — prints a real-time execution tree to the console as the agent runs. Best for development and debugging.
- **`LangfuseTraceProvider`** — ships every run to [Langfuse](https://langfuse.com) for production observability. Zero dependencies; just credentials.
- **`result.trace`** — returns trace data programmatically after the run completes. Best for storing costs, displaying progress in a UI, or analytics.

You can use any combination — `result.trace` is always available regardless of which provider you pass.

## ConsoleTraceProvider

Prints a real-time execution tree to the console as the agent runs — useful during development:

```typescript
import { Tuplet, ClaudeProvider, ConsoleTraceProvider } from 'tuplet'

const agent = new Tuplet({
  role: '...',
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

## LangfuseTraceProvider

Sends every agent run, LLM call, and tool call to [Langfuse](https://langfuse.com) for observability — token counts, cost, latency, full prompts, full responses, sub-agent hierarchy. No OpenTelemetry SDK or extra packages required: posts directly to Langfuse's ingestion API using Node 20+ built-in `fetch`.

### Setup

Set credentials via env vars:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com   # or https://cloud.langfuse.com (EU), or your self-hosted URL
```

Then wire it like any other trace provider:

```typescript
import { Tuplet, ClaudeProvider, LangfuseTraceProvider } from 'tuplet'

const trace = new LangfuseTraceProvider({
  sessionId: conversationId,            // groups runs in the Langfuse "Sessions" view
  userId: currentUserId,                // groups runs in the "Users" view
  tags: ['production', 'eu-cluster'],
})

const agent = new Tuplet({
  role: '...',
  llm: new ClaudeProvider({ apiKey: '...' }),
  trace,
  agentName: 'my_agent',
})
```

> **Region matters.** US-project keys only auth against `https://us.cloud.langfuse.com`; EU-project keys against `https://cloud.langfuse.com`. A region/key mismatch returns `401 Unauthorized`.

### What lands in Langfuse

| Tuplet event | Langfuse object | Notes |
| --- | --- | --- |
| `agent.run()` | **Trace** | Name = root agent name. Input = user message. Output = final response. Aggregated cost / tokens / durations land in `metadata`. |
| Sub-agent span | **Span** | Nested under its parent observation; depth-1 sub-agents attach directly to the trace. |
| LLM call | **Generation** | `model`, `usageDetails` (input/output/cache_read/cache_creation), `costDetails.total`, full system prompt + messages + response. |
| Tool call | **Span** | Input/output JSON. Failed tools surface as `level: ERROR` with `statusMessage` set to the tool error. |

### Flushing on exit

The provider buffers events in memory and flushes when the batch hits `flushAt` (default 20), after `flushIntervalMs` (default 3000ms), or when you call `flush()` / `shutdown()`. CLI processes are usually short-lived — drain the queue before exit:

```typescript
process.on('beforeExit', () => trace.shutdown())
process.on('SIGINT', async () => {
  await trace.shutdown()
  process.exit(0)
})
```

### Options

```typescript
new LangfuseTraceProvider({
  // credentials (default to env vars)
  publicKey,
  secretKey,
  baseUrl,                 // default: https://cloud.langfuse.com
                           // env fallbacks: LANGFUSE_BASE_URL, LANGFUSE_BASEURL, LANGFUSE_HOST

  // grouping & metadata (all optional)
  sessionId,               // groups runs in the Sessions view
  userId,                  // groups runs in the Users view
  tags: ['prod'],
  metadata: { /* free-form */ },
  release,                 // e.g. git sha
  version,                 // app version

  // capture controls
  captureMessages: true,   // include LLM input/output (default: true). Disable for sensitive data.
  captureToolIO: true,     // include tool input/output (default: true)
  maxPayloadChars: 32_768, // truncate large payloads

  // batching
  flushAt: 20,             // batch size that triggers a flush
  flushIntervalMs: 3000,   // periodic flush window
  requestTimeoutMs: 10_000,

  // diagnostics
  debug: true,             // log errors and per-event rejections (default: true)
  verbose: false,          // log a one-time `connected → ...` confirmation on first flush (default: false)

  // pricing override (same shape as ConsoleTraceProvider)
  modelPricing: { /* ... */ },
})
```

### Sessions

`sessionId` is captured at construction and stamped onto every trace the provider emits. All `agent.run()` calls during the process lifetime become separate Langfuse traces grouped under that session. To start a fresh session (e.g. after a "clear" command), construct a new `LangfuseTraceProvider` with a new `sessionId`.

### Debugging

With `debug: true` (default), the provider logs:

- Per-event rejection reasons when Langfuse returns 207 with errors, or when individual events fail validation.
- Auth/network errors with status code and response body.

Set `verbose: true` to also get a one-time `[langfuse] connected → <endpoint> (sent N, accepted M, rejected K)` line on the first successful flush — useful for confirming the integration is wired correctly. Off by default because it can collide with interactive prompts (the log fires asynchronously and lands wherever stdout currently is).

If you see `(sent N, accepted 0, rejected N)`, check the rejection reasons — they identify the offending field. If you see `401 Unauthorized`, verify region + keys. If nothing appears in the UI and there are no error logs, double-check the project filter at the top of the Langfuse page (you may be looking at a sibling project).

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

## Real-Time Cost Tracking

Monitor costs as they accumulate during execution — useful for budget enforcement, live dashboards, or aborting expensive runs early.

### Via TraceProvider

Implement the optional `onCostUpdate` callback to receive structured cost data after each LLM call:

```typescript
import type { TraceProvider, CostUpdate } from 'tuplet'

const traceProvider: TraceProvider = {
  // ... required callbacks ...

  onCostUpdate(update: CostUpdate) {
    console.log(`This call: $${update.callCost.toFixed(4)}`)
    console.log(`Total so far: $${update.cumulativeCost.toFixed(4)}`)
    console.log(`Model: ${update.modelId}`)

    // Abort if over budget
    if (update.cumulativeCost > 1.0) {
      abortController.abort()
    }
  }
}
```

The `CostUpdate` object contains:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `callCost` | `number` | Cost of this specific LLM call |
| `cumulativeCost` | `number` | Total cost across all LLM calls so far |
| `inputTokens` | `number` | Input tokens for this call |
| `outputTokens` | `number` | Output tokens for this call |
| `cacheCreationTokens` | `number?` | Cache write tokens (if applicable) |
| `cacheReadTokens` | `number?` | Cache read tokens (if applicable) |
| `modelId` | `string` | Model identifier (e.g. `"claude:claude-sonnet-4-20250514"`) |

### Via LogProvider

Cost data is also emitted through `onProgress` events with `type: 'usage'` — see [Progress Status](./progress-status.md).

## Custom Trace Provider

Implement `TraceProvider` to send traces to a database, observability platform, or any other system:

```typescript
import type { TraceProvider, Trace, AgentSpan, LLMCallEvent, ToolCallEvent, CostUpdate } from 'tuplet'

interface TraceProvider {
  onTraceStart(trace: Trace): void
  onTraceEnd(trace: Trace): void
  onAgentStart(span: AgentSpan, trace: Trace): void
  onAgentEnd(span: AgentSpan, trace: Trace): void
  onLLMCall(event: LLMCallEvent, span: AgentSpan, trace: Trace): void
  onToolCall(event: ToolCallEvent, span: AgentSpan, trace: Trace): void
  onCostUpdate?(update: CostUpdate): void      // optional — real-time cost tracking
  modelPricing?: Record<string, ModelPricing>
}
```
