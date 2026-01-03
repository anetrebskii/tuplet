# Execution Tracing

Track the full execution hierarchy with cost breakdown across agents, LLM calls, and tool invocations.

## Quick Start

```typescript
import { Hive, ClaudeProvider, ConsoleTraceProvider } from '@alexnetrebskii/hive-agent'

const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  agents: [...],
  llm: new ClaudeProvider({ apiKey: '...' }),
  trace: new ConsoleTraceProvider({ showCosts: true }),
  agentName: 'my_agent'
})

const result = await agent.run('Do something complex')
```

## Console Output

`ConsoleTraceProvider` outputs an execution tree:

```
[TRACE START] trace_abc123 - my_agent
[AGENT START] my_agent
[LLM] claude:claude-sonnet-4-20250514 - 1250 in / 89 out - $0.0042
[TOOL] search_food (125ms)
[AGENT START] nutrition_counter
[LLM] claude:claude-3-haiku-20240307 - 800 in / 45 out - $0.0003
[TOOL] log_meal (52ms)
[AGENT END] nutrition_counter - complete
[AGENT END] my_agent - complete
[TRACE END] trace_abc123 - 2.3s - $0.0045
```

## Custom Trace Provider

Implement `TraceProvider` for custom logging (database, observability platforms):

```typescript
import type {
  TraceProvider,
  Trace,
  AgentSpan,
  LLMCallEvent,
  ToolCallEvent
} from '@alexnetrebskii/hive-agent'

class DatadogTraceProvider implements TraceProvider {
  onTraceStart(trace: Trace): void {
    // Start a Datadog trace
  }

  onTraceEnd(trace: Trace): void {
    // End trace, record total cost
    datadogClient.gauge('agent.cost', trace.totalCost)
  }

  onAgentStart(span: AgentSpan, trace: Trace): void {
    // Start agent span
  }

  onAgentEnd(span: AgentSpan, trace: Trace): void {
    // End agent span with status
  }

  onLLMCall(event: LLMCallEvent, span: AgentSpan, trace: Trace): void {
    // Record LLM call metrics
    datadogClient.increment('agent.llm_calls', { model: event.modelId })
  }

  onToolCall(event: ToolCallEvent, span: AgentSpan, trace: Trace): void {
    // Record tool call metrics
    datadogClient.histogram('agent.tool_duration', event.durationMs)
  }
}
```

## Accessing Trace Data

The trace is available in the result for programmatic access:

```typescript
const result = await agent.run(message)

if (result.trace) {
  console.log(`Total cost: $${result.trace.totalCost.toFixed(4)}`)
  console.log(`Duration: ${result.trace.durationMs}ms`)

  // Walk the execution tree
  function printSpan(span: AgentSpan, depth = 0) {
    const indent = '  '.repeat(depth)
    console.log(`${indent}${span.agentName}: ${span.events.length} events`)
    for (const child of span.children) {
      printSpan(child, depth + 1)
    }
  }
  printSpan(result.trace.rootSpan)
}
```

## Usage by Model

Track token usage broken down by provider and model:

```typescript
const result = await agent.run(message)

// Aggregated usage by model (includes sub-agents)
if (result.usageByModel) {
  for (const [modelId, usage] of Object.entries(result.usageByModel)) {
    console.log(`${modelId}:`)
    console.log(`  ${usage.inputTokens} input / ${usage.outputTokens} output`)
    console.log(`  ${usage.calls} API calls`)
    if (usage.cacheReadInputTokens) {
      console.log(`  ${usage.cacheReadInputTokens} tokens from cache`)
    }
  }
}
```

Output:

```
claude:claude-sonnet-4-20250514:
  2500 input / 180 output
  2 API calls
claude:claude-3-haiku-20240307:
  800 input / 45 output
  1 API calls
  650 tokens from cache
```

## Custom Model Pricing

Override default pricing for cost calculation:

```typescript
const agent = new Hive({
  systemPrompt: '...',
  tools: [...],
  llm: provider,
  trace: new ConsoleTraceProvider({ showCosts: true }),
  modelPricing: {
    'claude:claude-sonnet-4-20250514': {
      inputTokens: 3.0,      // $ per 1M tokens
      outputTokens: 15.0,
      cacheWriteTokens: 3.75,
      cacheReadTokens: 0.30
    },
    'openai:gpt-4o': {
      inputTokens: 2.5,
      outputTokens: 10.0
    }
  }
})
```

## Trace Structure

```typescript
interface Trace {
  traceId: string
  startTime: number
  endTime?: number
  durationMs?: number
  rootSpan: AgentSpan
  totalCost: number
}

interface AgentSpan {
  spanId: string
  agentName: string
  parentSpanId?: string
  startTime: number
  endTime?: number
  durationMs?: number
  status: 'running' | 'complete' | 'error' | 'interrupted'
  events: TraceEvent[]
  children: AgentSpan[]
  cost: number
}

type TraceEvent = LLMCallEvent | ToolCallEvent

interface LLMCallEvent {
  type: 'llm_call'
  timestamp: number
  modelId: string
  inputTokens: number
  outputTokens: number
  cacheWriteTokens?: number
  cacheReadTokens?: number
  durationMs: number
  cost: number
}

interface ToolCallEvent {
  type: 'tool_call'
  timestamp: number
  toolName: string
  durationMs: number
  success: boolean
}
```

## TraceProvider Interface

```typescript
interface TraceProvider {
  onTraceStart?(trace: Trace): void
  onTraceEnd?(trace: Trace): void
  onAgentStart?(span: AgentSpan, trace: Trace): void
  onAgentEnd?(span: AgentSpan, trace: Trace): void
  onLLMCall?(event: LLMCallEvent, span: AgentSpan, trace: Trace): void
  onToolCall?(event: ToolCallEvent, span: AgentSpan, trace: Trace): void
}
```

## ConsoleTraceProvider Options

```typescript
interface ConsoleTraceConfig {
  showCosts?: boolean      // Show cost per LLM call (default: false)
  showTokens?: boolean     // Show token counts (default: true)
  showDuration?: boolean   // Show durations (default: true)
  prefix?: string          // Prefix for log lines
}

const trace = new ConsoleTraceProvider({
  showCosts: true,
  showTokens: true,
  showDuration: true,
  prefix: '[TRACE]'
})
```

## Example: Database Logger

```typescript
class PostgresTraceProvider implements TraceProvider {
  constructor(private db: Pool) {}

  async onTraceEnd(trace: Trace): Promise<void> {
    await this.db.query(
      `INSERT INTO agent_traces (trace_id, duration_ms, total_cost, root_span)
       VALUES ($1, $2, $3, $4)`,
      [trace.traceId, trace.durationMs, trace.totalCost, JSON.stringify(trace.rootSpan)]
    )
  }

  async onLLMCall(event: LLMCallEvent, span: AgentSpan, trace: Trace): Promise<void> {
    await this.db.query(
      `INSERT INTO llm_calls (trace_id, agent_name, model_id, tokens_in, tokens_out, cost)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [trace.traceId, span.agentName, event.modelId, event.inputTokens, event.outputTokens, event.cost]
    )
  }
}
```
