# Progress Updates

Track what your agent is doing in real-time — thinking, calling tools, spawning sub-agents, AI reasoning text, token usage — via the `onProgress` callback on the logger. Useful for showing spinners, status lines, or live activity feeds in your UI.

```typescript
const agent = new Tuplet({
  role: '...',
  llm: provider,
  logger: {
    onProgress: (update) => {
      const indent = '  '.repeat(update.depth ?? 0)

      switch (update.type) {
        case 'thinking':
          showSpinner('Thinking...')
          break
        case 'text':
          // AI intermediate reasoning (e.g. "Let me check the code...")
          console.log(`${indent}${update.message}`)
          // Full text available in update.details.text
          break
        case 'tool_start':
          showSpinner(`${indent}${update.message}`)
          break
        case 'tool_end':
          hideSpinner()
          break
        case 'sub_agent_start':
          showSpinner(`${indent}Delegating to ${update.details?.agentName}...`)
          break
        case 'sub_agent_end':
          hideSpinner()
          break
        case 'usage':
          // Cumulative token stats and cost after each LLM call
          const { inputTokens, outputTokens, elapsed, callCost, cumulativeCost } = update.details?.usage ?? {}
          console.log(`${indent}Tokens: ${inputTokens} in / ${outputTokens} out (${(elapsed! / 1000).toFixed(1)}s)`)
          console.log(`${indent}Cost: $${callCost?.toFixed(4)} this call, $${cumulativeCost?.toFixed(4)} total`)
          break
      }
    }
  }
})
```

## Event Types

| Type | When | Details |
| ---- | ---- | ------- |
| `thinking` | Agent is processing | — |
| `text` | AI emits intermediate text | `text` (full content) |
| `tool_start` | Tool execution begins | `toolName` |
| `tool_end` | Tool execution completes | `toolName`, `duration`, `success` |
| `sub_agent_start` | Sub-agent spawned | `agentName` |
| `sub_agent_end` | Sub-agent finished | `agentName`, `success` |
| `usage` | Token stats & cost after LLM call | `usage.inputTokens`, `usage.outputTokens`, `usage.elapsed`, `usage.callCost`, `usage.cumulativeCost`, `usage.modelId` |
| `status` | General status messages | — |

The `message` field always contains a human-readable description (e.g. `"Creating task: 'Fix bug'..."`, `"$ grep -r 'config'"`, `"Delegating to researcher..."`).

## Common Fields

Every `ProgressUpdate` includes `type` and `message`. These optional fields enable richer UIs:

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | `string` | Correlation ID — matches `tool_start` with its `tool_end`, or `sub_agent_start` with `sub_agent_end` |
| `depth` | `number` | Nesting depth: `0` for root agent, `1` for sub-agent, `2` for nested sub-agent, etc. |
| `parentId` | `string` | Parent event ID — use with `id` to build a tree of nested events |
| `details` | `object` | Event-specific data (see Event Types table above) |

## Depth & Hierarchy

Sub-agent events are automatically tagged with increasing `depth`. Use it for indented rendering:

```typescript
onProgress: (update) => {
  const indent = update.depth ? '  '.repeat(update.depth) + '└ ' : ''
  console.log(`${indent}${update.message}`)
}
```

Events from a sub-agent's sub-agent get `depth: 2`, and so on. The `parentId` field links child events to the `sub_agent_start` that spawned them, enabling tree-structured UIs.

## Task Progress

For [task management](./task-management.md) updates specifically, use `onTaskUpdate`:

```typescript
logger: {
  onTaskUpdate: (update) => {
    console.log(`Progress: ${update.progress.completed}/${update.progress.total}`)

    if (update.current) {
      console.log(`Working on: ${update.current.activeForm}`)
      // "Implementing API endpoints"
    }
  }
}
```

Both callbacks can be used together — `onProgress` for real-time activity, `onTaskUpdate` for high-level task tracking.
